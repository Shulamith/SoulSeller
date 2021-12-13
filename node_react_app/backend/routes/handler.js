const express = require('express');
const router = express.Router();
const EbayAuthToken = require('ebay-oauth-nodejs-client');
const ebayAuthToken = new EbayAuthToken({
    filePath: './routes/ebay-config.json' // input file path.
});
const fetch = require('cross-fetch');
//const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Schemas = require('../models/Schemas.js');
const axios = require('axios');
require('dotenv/config');

router.use(express.urlencoded({ extended: false }));


// Add Access Control Allow Origin headers
router.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.header("Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const fs = require('fs')
const multer = require('multer') // multer will parse bodies that cannot be parse by bodyparser such as form data

const storage = multer.diskStorage({
    destination: function(req, file, cb){
    cb(null, './uploads/'); // where incoming file gets stored
    },
    filename: function(req, file, cb) {
        cb(null, new Date().toISOString() + file.originalname); // set name of incoming file
    }
});

const fileFilter = (req, file, cb) => {

    if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/jpg') {
        cb(null, true); //accept files
    } else {
        cb(null, false); //reject files
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // accept files up to 5MB
    },
    fileFilter: fileFilter
}); // multer will try to store all incoming files here



/* ------------------ BEGIN ETSY OAUTH ------------------ */

/**
These variables contain our Etsy API Key, the state sent
in the initial authorization request, and the client verifier compliment
to the code_challenge sent with the initial authorization request
*/
const etsyClientID = process.env.ETSY_KEY;
const etsyClientVerifier = process.env.ETSY_VERIFY;
const etsyRedirectUri = 'http://localhost:4000/oauth/redirect';


// Send a JSON response to a default get request
router.get('/ping', async (req, res) => {
    const requestOptions = {
        'method': 'GET',
        'headers': {
            'x-api-key': etsyClientID,
        },
    };

    const response = await fetch(
        'https://openapi.etsy.com/v3/application/openapi-ping',
        requestOptions
    );

    if (response.ok) {
        const data = await response.json();
        res.send(data);
    } else {
        res.send("oops");
    }
});


router.get('/oauth/redirect', async (req, res) => {
    // The req.query object has the query params that Etsy authentication sends
    // to this route. The authorization code is in the `code` param
    const authCode = req.query.code;
    //console.log("Got to etsy redirect");
    const tokenUrl = 'https://api.etsy.com/v3/public/oauth/token';
    const requestOptions = {
        method: 'POST',
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: etsyClientID,
            redirect_uri: etsyRedirectUri,
            code: authCode,
            code_verifier: etsyClientVerifier,
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const response = await fetch(tokenUrl, requestOptions);

    // Extract the access token from the response access_token data field
    if (response.ok) {
        const tokenData = await response.json();
        //console.log("Response okay");
        const inventory = await getEtsyInventory(tokenData.access_token);
        res.send(inventory);
    } else {
        res.send("Response was not okay");
    }
});

async function getEtsyInventory (access_token) {    // We passed the access token in via the querystring
    //console.log("AT RECIEVE INVENTORY ACCESS TOKEN");

    // An Etsy access token includes your shop/user ID
    // as a token prefix, so we can extract that too
    const user_id = access_token.split('.')[0];
    //console.log("USER ID:", user_id);
    const authorization = 'Bearer ' + access_token;
    const requestOptions = {
        headers: {
            'x-api-key': etsyClientID
        }
    };
    axios.get(`https://openapi.etsy.com/v3/application/users/${user_id}/shops`,requestOptions)
    .then(response => {
    //  console.log("TRIED GET AND RECIEVED RESPONSE");
      //console.log(response.data);
      //console.log("GETTING SHOP DATA");
      const shop_id = response.data.shop_id;
    //  console.log("SHOP ID", shop_id);
        createEtsyListing(authorization, "1", "TestWater", "testingetsyapi", "0.40",
           "i_did", "true", "made_to_order", shop_id);
        const shopRequestOptions = {
            method: 'GET',
            headers: {
                'x-api-key': etsyClientID,
                // Scoped endpoints require a bearer token
                'Authorization': authorization
            }
        }
        axios.get(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`,shopRequestOptions)
          .then(shopResponse => {
            //console.log("Price", shopResponse.data.results[0].price);
            //TEST FOR POST BELOW
            return JSON.stringify(shopResponse.data);
          })
        .catch(error => {
          //console.log(error);
          return "Error"
        });
  })
    .catch(error => {
      //console.log("ERROR");
      //console.log(error);
      return "ERROR";
    });
};

/* ------------------ END ETSY OAUTH ------------------ */



//GO http://localhost:4000/addItem TO ADD ITEM WITH THIS CODE
router.get('/addItem', async (req, res) => {
    const user = Schemas.Users; //define user
    const userId = await user.findOne({ username: 'ramon' }).exec();

    const item = { item: 'Soul Eater, Volumes: 1-5', price: '15.49', channel: 'Amazon', user: userId }
    const newItem = new Schemas.Items(item);

    try {
        await newItem.save(async (err, newItemResult) => {
            console.log('New Item created!');
            res.end('New Item created!');
        });

    } catch (err) {
        console.log(err);
        res.end('Item not added!');
    }
});


router.get('/inventory', authenticateToken, async (req, res) => { // here we grab our items
    const items = Schemas.Items;

    // const userItems = await items.find({}, (err, itemsData) => {

    // this code will get all items and join the user table
    const userItems = await items.find({}).populate("user").exec((err, itemsData) => { // finds all items and automaticlly add user associated with item
        if (err) throw err;                                                             // we want to be able to select all the items and find the user
        if (itemsData) {
            res.end(JSON.stringify(itemsData));
        } else {
            res.end();
        }
    }); // so when we query our tables and finds all of our items with will auto add user associated with that tweet
});


// .single will try to parse one file only, field name  = productImage
router.post('/addItem', upload.single('productImage'), async (req, res, next) => { // when user post items it gets sent to router to be added

    console.log(req.file);

    const itemName = req.body.itemName; // get item input field, name of field = itemInput
    const itemDescription = req.body.itemDescription;
    const ebayPrice = req.body.ebayPrice;
    const etsyPrice = req.body.etsyPrice;
    const imagePath = req.file.path;
    const imageType = req.file.mimetype;
    const imageData = fs.readFileSync(req.file.path)
    console.log(imageData);

    const user = Schemas.Users; //define user
    const userId = await user.findOne({ username: 'ramon' }).exec(); //need to create loginin to save userID for refrence, so now we manually add username
    // grab and wait till it gets it
    // findone = mongose function to find document in db

    const newItem = new Schemas.Items({  // save the item
        item: itemName,
        description: itemDescription,
        etsyPrice: etsyPrice,
        ebayPrice: ebayPrice,
        image: {
            data: imageData,
            contentType: imageType,
            imagePath: imagePath
        },
        user: userId._id // field to link user whose saving item

    });

    try { // we try to add it now
        await newItem.save((err, newItemResults) => {
            if (err) res.end('Error Saving.'); // if error
            res.redirect('/inventory'); // else, redirect back to inventory page
            res.end(); // make sure page ends after redirection
        });
    } catch (err) { // catch any errors
        console.log(err); // console log any erros
        res.redirect('/inventory'); // redirect page
        res.end(); // end page
    }
});

// router.post(‘/addItem’, async(req,res,next) => {
//     const newItem = new Schemas.Items({
//     newItem.image.data = fs.readFileSync(req.file.path)
//     newItem.image.contentType = file.mimetype;
//     });
// newItem.save()
//   });

router.get('/ebayauth', (req, res) => {
  const scopes = ['https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
];
  console.log("TEST");
  res.header('Access-Control-Allow-Origin', '*');
  const AuthUrl = ebayAuthToken.generateUserAuthorizationUrl('PRODUCTION', scopes);

  console.log(AuthUrl);
  //console.log(res.redirect(AuthUrl));
  return res.redirect(AuthUrl);;
});

// router.get('/profile', authenticateToken, (req, res) => {
//     res.json({ status: 'ok', id: req.user.id, username: req.user.username, email: req.user.email });
// });

router.post('/login', async (req, res) => {

    const User = Schemas.Users;
    const user = await User.findOne({ email: req.body.email }).lean();

    if (!user) {

        return res.json({ status: 'error', error: 'Invalid email/password' });
    }

    try {
        if (await bcrypt.compare(req.body.password, user.password)) {

            const accessToken = generateAccessToken(user);
            const refreshToken = jwt.sign(user, process.env.REFRESH_SECRET);

            const _newToken = { token: refreshToken, user: user };
            const newToken = new Schemas.Refresh(_newToken);

            try {
                await newToken.save(async (err, newTokenResult) => {
                    console.log('User login successful');
                    res.status(201).send();
                });

            } catch (err) {
                res.status(500).send();
            }

            return res.json({ status: 'ok', message: 'User log in was successful', user: user.username, accessToken: accessToken });
        }

    } catch (err) {

        console.log(err);
    }

    res.json({ status: 'error', error: 'Invalid email/password' });

});

router.delete('/logout', authenticateToken, async (req, res) => {

    const Token = Schemas.Refresh;

    await Token.findOneAndRemove({ user: req.user.id }, (err, deleteSuccess) => {

        if (!err) {

            console.log('User successfully logged out');
            console.log(deleteSuccess);

        } else console.log(err);

    }).clone();

    res.json({ status: '204', message: 'User successfully logged out' });
});

router.post('/register', async (req, res) => {

  var hashedPassword = '';

    try {
        hashedPassword = await bcrypt.hash(req.body.password, 12);
    } catch (err) {
        console.log(err);
        res.end('Password not generated!')
    }

    const user = { username: req.body.name, email: req.body.email, password: hashedPassword };
    const newUser = new Schemas.Users(user);

    try {
        await newUser.save(async (err, newUserResult) => {
            console.log('New user created!');
            res.status(201).send();
        });

    } catch (err) {
        res.status(500).send();
    }

});

router.post('/token', async (req, res) => {

    const refreshToken = req.body.token;

    if (refreshToken == null) return res.sendStatus(401);

    const Token = Schemas.Refresh;
    const token = await Token.findOne({ token: refreshToken }).lean();
    if (!token) return res.sendStatus(403);

    jwt.verify(token, process.env.REFRESH_SECRET, (err, user) => {

        if (err) return res.sendStatus(403);
        const accessToken = generateAccessToken({ name: user.name });
        res.json({ accessToken: accessToken });

    });

});

function authenticateToken(req, res, next) {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.ACCESS_SECRET, (err, user) => {

        if (err) return res.sendStatus(403);
        req.user = user;
        next();

    });

};

function generateAccessToken(user) {
    return jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.ACCESS_SECRET, { expiresIn: '1h' });
};

async function getInventory(token) {
    auth = 'Bearer ' + token;
    axios.get('https://api.ebay.com/sell/inventory/v1/inventory_item?limit=2&offset=0', {
        headers: {
            'Authorization': auth,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            console.log(response.data);
            console.log(response);
        })
        .catch(error => {
            console.log(error);
        });
    return "GET INVENTORY";
};

async function getTaxonmyID () {
  const requestOptions = {
      'method': 'GET',
      'headers': {
          'x-api-key': etsyClientID,
      },
  };
  axios.get('https://openapi.etsy.com/v3/application/taxonomy/seller/get',
  requestOptions)
  .then( response => {
    const data = response.json().data;
    console.log("taxonomyData", data)
    return data;
  })
  .catch( err => {
    console.log(err)
  });
};


/* BEGIN ETSY POST */
//TODO:
//1) getTaxonmyID,
//2)get the ShippingID for the user (and ask them to select which?)
//3) or ask them to create one.
//4) Redirect to....
//5)

async function createEtsyListing(auth, quantity, title, description, price,
   who_made, is_supply,when_made, shop_id) {
  const taxonomy_id = "1296"
  //= await getTaxonmyID();
  var headers = new fetch.Headers();
  headers.append("Content-Type", "application/x-www-form-urlencoded");//x-www-form-urlencoded
  headers.append("x-api-key", etsyClientID);
  headers.append("Authorization", auth);

  var shippingParams = new URLSearchParams();
  shippingParams.append("title", "New profile six");
  shippingParams.append("min_processing_time", 1);
  shippingParams.append("title", "New profile five");
  shippingParams.append("min_processing_time", 1);
  shippingParams.append("max_processing_time", 9);
  shippingParams.append("origin_country_iso", "BV");
  shippingParams.append("primary_cost", 50.00);
  shippingParams.append("secondary_cost", 35.00);
  shippingParams.append("destination_country_iso", "BV");
  shippingParams.append("min_delivery_days", 2);
  shippingParams.append("max_delivery_days", 45);

var requestShippingProfile = {
    method: 'POST',
    headers: headers,
    body: shippingParams,
    redirect: 'follow'
};

fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/shipping-profiles`, requestShippingProfile)
    .then(result => console.log("RESULT",result))
    .catch(error => console.log('error', error));

  var urlencoded = new URLSearchParams();
  urlencoded.append('quantity', quantity);
  urlencoded.append('title',title);
  urlencoded.append('description', description);
  urlencoded.append('price', price);
  urlencoded.append('taxonomy_id', taxonomy_id);
  urlencoded.append('who_made', who_made);
  urlencoded.append('is_supply', is_supply);
  urlencoded.append('when_made', when_made);
  urlencoded.append('shipping_profile_id',162052746338)

  var requestOptions = {
    method: 'POST',
    headers: headers,
    body: urlencoded,
    redirect: 'follow'
 };

fetch(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`, requestOptions)
    .then(response => response.text())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));

















//
//   const headers = {
//     client_id: etsyClientID,
//     Authorization: auth,
//     'Host': 'openapi.etsy.com',
//     'Content-Type': 'application/x-www-for-urlencoded'
//   };
//   const parameters = JSON.stringify({
//     'quantity' : quantity,
//     'title' : title,
//     'description': description,
//     'price' : price,
//     'taxonomy_id' : taxonomy_id,
//     'who_made' : who_made,
//     'is_supply' : is_supply,
//     'when_made' : when_made
//   });
//
//
//
//
//   const requestOptionsTwo = {
//     method: 'POST',
//     headers: {
//       'x-api-key': etsyClientID,
//       'Authorization': auth,
//       'Host': 'openapi.etsy.com',
//       'Content-Type': 'application/x-www-for-urlencoded'
//     },
//      body: parameters,
//     redirect: 'follow'
//   };
// //   var requestOptions = {
// //     method: 'POST',
// //     headers: headers,
// //     body: urlencoded,
// //     redirect: 'follow'
// // };
//   console.log("TRYING TO POST from etsy")
//   // }
//   axios(`https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`, requestOptionsTwo)
//   .then(response => {
//     console.log("GOT ETSY RESPONSE FOR LISTINGS", response)
//     console.log("post etsy res data:",response.data)
//   })
//   .then(result => console.log(result))
//   .catch(error => {
//       console.log(error);
//   });
}

module.exports = router;
