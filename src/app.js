const express = require('express');
const line = require('@line/bot-sdk');

function createExpressApp({ config, handleEvent, sendDailySummary }) {
  const app = express();

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

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
      response.status(200).json({ ok: true, ...result });
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
