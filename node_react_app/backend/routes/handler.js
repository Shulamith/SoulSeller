const express = require('express');
const router = express.Router();
const EbayAuthToken = require('ebay-oauth-nodejs-client');
const ebayAuthToken = new EbayAuthToken({
    filePath: './routes/ebay-config.json' // input file path.
});
const fetch = require('cross-fetch');
const bcrypt = require('bcryptjs');
const Schemas = require('../models/Schemas.js');
const User = Schemas.Users;

require('dotenv/config');

router.use(express.urlencoded({ extended: false }));


// Add Access Control Allow Origin headers
router.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

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


router.get("/oauth/redirect", async (req, res) => {
    // The req.query object has the query params that Etsy authentication sends
    // to this route. The authorization code is in the `code` param
    const authCode = req.query.code;
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
        //res.redirect('/inventory');
        res.redirect(`/inventory?access_token=${tokenData.access_token}`);
    } else {
        res.send("oops");
    }
});

/* ------------------ END ETSY OAUTH ------------------ */



//GO http://localhost:4000/addItem TO ADD ITEM WITH THIS CODE
router.get('/addItem', async (req, res) => {
    const user = Schemas.Users; //define user
    const userId = await user.findOne({ username: 'tahmid198' }).exec();

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


router.get('/inventory', async (req, res) => { // here we grab our items
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



    // const str = [{
    //     "product": "Nintendo Gameboy Advance",
    //     "channel": "Amazon",
    //     "username": "tahmid_z"
    // }];
    // res.end(JSON.stringify(str));
});

router.post('/addItem', async (req, res) => { // when user post items it gets sent to router to be added
    const itemName = req.body.itemName; // get item input field, name of field = itemInput
    const itemDescription = req.body.itemDescription;
    const ebayPrice = req.body.ebayPrice;
    const etsyPrice = req.body.etsyPrice;
    const user = Schemas.Users; //define user
    const userId = await user.findOne({ username: 'tahmid198' }).exec(); //need to create loginin to save userID for refrence, so now we manually add username
    // grab and wait till it gets it
    // findone = mongose function to find document in db

    const newItem = new Schemas.Items({  // save the item
        item: itemName,
        description: itemDescription,
        etsyPrice: etsyPrice,
        ebayPrice: ebayPrice,
        user: userId._id, // field to link user whose saving item
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
  // // Authorization Code Auth Flow
  //res.header('Access-Control-Allow-Origin', '*');
  const AuthUrl = ebayAuthToken.generateUserAuthorizationUrl('SANDBOX', scopes);
  console.log(AuthUrl);
  return res.redirect(AuthUrl);
  //res.header('Access-Control-Allow-Origin', '*'); //SD: GET BACK TO THIS!
//  return res.end(JSON.stringify(AuthUrl));
});

router.post('/addProduct', (req, res) => {
    res.end('NA');
});


//router.post('/login', (req, res) => {

//    const User = Schemas.Users;

//    User.findOne({ email: req.body.email }, function (err, docs) {
//        if (err) {
//            console.log(err);
//        }
//        else {
//            console.log("First function call : ", docs.password);
//        }
//    });
//    res.end();
//});


router.post('/register', async (req, res) => {

    var salt = '';
    var hashedPassword = '';

    try {
        salt = await bcrypt.genSalt(Math.floor(Math.random() * 12));
        hashedPassword = await bcrypt.hash(req.body.password, salt);
    } catch (err) {
        console.log(err);
        res.end('Password not generated!')
    }

    const user = { username: req.body.name, email: req.body.email, password: hashedPassword };
    const newUser = new Schemas.Users(user);

    try {
        await newUser.save(async (err, newUserResult) => {
            console.log('New user created!');
            res.end();
        });

    } catch (err) {
        res.end('User not added!');
    }

});


module.exports = router;
