const express = require('express');
const line = require('@line/bot-sdk');
const { createLiffPage } = require('./liff-page');

function createExpressApp({
  config,
  handleEvent,
  sendDailySummary,
  liffRouter = null,
  removeExpiredImages = null,
}) {
  const app = express();

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/liff', (_request, response) => {
    response.set({
      'cache-control': 'private, no-store, max-age=0',
      'content-security-policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://static.line-scdn.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "connect-src 'self' https://*.line.me",
        "frame-src https://*.line.me",
        "frame-ancestors 'self' https://*.line.me",
      ].join('; '),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    });
    response.type('html').send(createLiffPage(config.liffId));
  });

  if (liffRouter) {
    app.use('/api/liff', liffRouter);
  } else {
    app.use('/api/liff', (_request, response) => {
      response.status(503).json({ error: 'LIFF 尚未完成設定。' });
    });
  }

  app.get('/api/cron/daily-handover-summary', async (request, response) => {
    const expectedAuthorization = config.cronSecret
      ? `Bearer ${config.cronSecret}`
      : null;
    if (
      !expectedAuthorization ||
      request.get('authorization') !== expectedAuthorization
    ) {
      response.status(401).json({ ok: false });
      return;
    }

    if (!config.dailySummaryGroupId || !sendDailySummary) {
      response.status(503).json({
        ok: false,
        error: 'Daily summary is not configured.',
      });
      return;
    }

    try {
      const result = await sendDailySummary();
      const removedImages = removeExpiredImages
        ? await removeExpiredImages()
        : 0;
      response.status(200).json({ ok: true, ...result, removedImages });
    } catch (error) {
      console.error('Daily handover summary failed:', error);
      response.status(500).json({ ok: false });
    }
  });

  app.post(
    '/webhook',
    line.middleware({
      channelAccessToken: config.channelAccessToken,
      channelSecret: config.channelSecret,
    }),
    async (request, response) => {
      try {
        await Promise.all(request.body.events.map(handleEvent));
        response.status(200).json({ ok: true });
      } catch (error) {
        console.error('Webhook processing failed:', error);
        response.status(500).json({ ok: false });
      }
    },
  );

  app.use((error, _request, response, _next) => {
    if (error.name === 'SignatureValidationFailed') {
      response.status(401).json({ ok: false });
      return;
    }

    if (error.name === 'JSONParseError') {
      response.status(400).json({ ok: false });
      return;
    }

    console.error('Unhandled request error:', error);
    response.status(500).json({ ok: false });
  });

  return app;
}

module.exports = { createExpressApp };
