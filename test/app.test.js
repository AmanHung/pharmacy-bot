const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createExpressApp } = require('../src/app');

const CHANNEL_SECRET = 'test-channel-secret';

function createSignature(body) {
  return crypto
    .createHmac('sha256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
}

async function startTestServer(
  handleEvent,
  {
    cronSecret = 'test-cron-secret',
    dailySummaryGroupId = 'G-PRODUCTION',
    sendDailySummary = async () => ({
      status: 'sent',
      date: '2026-07-24',
      recordCount: 2,
    }),
  } = {},
) {
  const app = createExpressApp({
    config: {
      channelAccessToken: 'test-channel-access-token',
      channelSecret: CHANNEL_SECRET,
      cronSecret,
      dailySummaryGroupId,
    },
    handleEvent,
    sendDailySummary,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('健康檢查回傳正常狀態', async (context) => {
  const server = await startTestServer(async () => {});
  context.after(server.close);

  const response = await fetch(`${server.baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('有效 LINE 簽章會將 Webhook 事件交給處理器', async (context) => {
  const events = [];
  const server = await startTestServer(async (event) => {
    events.push(event);
  });
  context.after(server.close);
  const body = JSON.stringify({
    destination: 'Ubot',
    events: [
      {
        type: 'message',
        webhookEventId: '01TESTEVENT',
        source: { type: 'group', groupId: 'G1', userId: 'U1' },
        message: { type: 'text', id: 'message-1', text: '/help' },
      },
    ],
  });

  const response = await fetch(`${server.baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': createSignature(body),
    },
    body,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].webhookEventId, '01TESTEVENT');
});

test('無效 LINE 簽章會被拒絕', async (context) => {
  let eventCount = 0;
  const server = await startTestServer(async () => {
    eventCount += 1;
  });
  context.after(server.close);
  const body = JSON.stringify({ destination: 'Ubot', events: [] });

  const response = await fetch(`${server.baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': 'invalid-signature',
    },
    body,
  });

  assert.equal(response.status, 401);
  assert.equal(eventCount, 0);
});

test('有效排程密鑰會觸發每日交班摘要', async (context) => {
  let sendCount = 0;
  const server = await startTestServer(async () => {}, {
    sendDailySummary: async () => {
      sendCount += 1;
      return {
        status: 'sent',
        date: '2026-07-24',
        recordCount: 2,
      };
    },
  });
  context.after(server.close);

  const response = await fetch(
    `${server.baseUrl}/api/cron/daily-handover-summary`,
    {
      headers: {
        authorization: 'Bearer test-cron-secret',
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: 'sent',
    date: '2026-07-24',
    recordCount: 2,
    removedImages: 0,
  });
  assert.equal(sendCount, 1);
});

test('缺少或錯誤排程密鑰時不會推播', async (context) => {
  let sendCount = 0;
  const server = await startTestServer(async () => {}, {
    sendDailySummary: async () => {
      sendCount += 1;
    },
  });
  context.after(server.close);

  const response = await fetch(
    `${server.baseUrl}/api/cron/daily-handover-summary`,
  );

  assert.equal(response.status, 401);
  assert.equal(sendCount, 0);
});

test('LIFF 資訊中心頁面可載入且未設定 API 時安全拒絕', async (context) => {
  const server = await startTestServer(async () => {});
  context.after(server.close);

  const pageResponse = await fetch(`${server.baseUrl}/liff`);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /藥劑科資訊中心/);
  assert.equal(
    pageResponse.headers.get('cache-control'),
    'private, no-store, max-age=0',
  );

  const apiResponse = await fetch(`${server.baseUrl}/api/liff/records`);
  assert.equal(apiResponse.status, 503);
});
