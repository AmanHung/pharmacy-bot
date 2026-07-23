const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

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
  const client = new line.Client(config);
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: '系統已收到您的測試訊息：' + event.message.text
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('伺服器啟動中，監聽通訊埠：' + port);
});
module.exports = app;