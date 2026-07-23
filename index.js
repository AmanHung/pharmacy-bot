const express = require('express');
const line = require('@line/bot-sdk');
const admin = require('firebase-admin');
require('dotenv').config();

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
credential: admin.credential.cert(serviceAccount),
databaseURL: "https://pharmacy-bot-fd2cb-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

const config = {
channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
channelSecret: process.env.CHANNEL_SECRET
};

const app = express();

app.post('/webhook', line.middleware(config), (req, res) => {
Promise
.all(req.body.events.map(handleEvent))
.then((result) => res.json(result))
.catch((err) => {
console.error(err);
res.status(500).end();
});
});

function handleEvent(event) {
if (event.type !== 'message' || event.message.type !== 'text') {
return Promise.resolve(null);
}
const client = new line.messagingApi.MessagingApiClient({
channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});
return client.replyMessage({
replyToken: event.replyToken,
messages: [{
type: 'text',
text: '系統已準備好寫入資料庫，收到訊息：' + event.message.text
}]
});
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
console.log('伺服器啟動中，監聽通訊埠：' + port);
});
module.exports = app;