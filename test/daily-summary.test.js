const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDailySummarySender,
  createRetryKey,
  getTaipeiDateKey,
} = require('../src/daily-summary');

test('臺灣日期會用於每日摘要的防重送金鑰', () => {
  const timestamp = Date.parse('2026-07-24T00:00:00.000Z');

  assert.equal(getTaipeiDateKey(timestamp), '2026-07-24');
  assert.match(
    createRetryKey('G1', '2026-07-24'),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    createRetryKey('G1', '2026-07-24'),
    createRetryKey('G1', '2026-07-24'),
  );
  assert.notEqual(
    createRetryKey('G1', '2026-07-24'),
    createRetryKey('G1', '2026-07-25'),
  );
});

test('每日摘要會查詢所有未處理交班並推播到指定群組', async () => {
  const calls = [];
  const records = [
    {
      shortId: 'H-ONE001',
      category: 'handover',
      content: '確認特殊藥品庫存',
      authorName: '王藥師',
      status: 'open',
      createdAt: Date.parse('2026-07-23T01:00:00.000Z'),
    },
  ];
  const sender = createDailySummarySender({
    groupId: 'G-PRODUCTION',
    now: () => Date.parse('2026-07-24T00:00:00.000Z'),
    repository: {
      async listRecords(scope, filters) {
        assert.deepEqual(scope, {
          type: 'group',
          id: 'G-PRODUCTION',
        });
        assert.equal(filters.category, 'handover');
        assert.equal(filters.createdSince, undefined);
        assert.equal(filters.limit, 100);
        return records;
      },
    },
    client: {
      async pushMessage(request, retryKey) {
        calls.push({ request, retryKey });
      },
    },
  });

  const result = await sender();

  assert.deepEqual(result, {
    status: 'sent',
    date: '2026-07-24',
    recordCount: 1,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.to, 'G-PRODUCTION');
  assert.equal(calls[0].request.messages[0].type, 'flex');
  assert.match(calls[0].request.messages[0].altText, /交班未完成資訊/);
  assert.match(calls[0].retryKey, /^[0-9a-f-]{36}$/);
});

test('沒有未處理交班時仍會推播清空摘要', async () => {
  let pushedMessage;
  const sender = createDailySummarySender({
    groupId: 'G-PRODUCTION',
    repository: {
      async listRecords() {
        return [];
      },
    },
    client: {
      async pushMessage(request) {
        [pushedMessage] = request.messages;
      },
    },
  });

  await sender();

  assert.deepEqual(pushedMessage, {
    type: 'text',
    text: '【每日未處理交班摘要】\n目前沒有未處理交班事項。',
  });
});

test('未設定目標群組時不會推播', async () => {
  let pushCount = 0;
  const sender = createDailySummarySender({
    groupId: null,
    repository: {
      async listRecords() {
        throw new Error('不應查詢');
      },
    },
    client: {
      async pushMessage() {
        pushCount += 1;
      },
    },
  });

  assert.deepEqual(await sender(), { status: 'disabled' });
  assert.equal(pushCount, 0);
});
