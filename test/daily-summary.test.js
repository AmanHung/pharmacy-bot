const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDailyMessages,
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
  const handoverRecords = [
    {
      shortId: 'H-ONE001',
      category: 'handover',
      content: '夜班交班：確認住院藥品',
      authorName: '王藥師',
      status: 'open',
      createdAt: Date.parse('2026-07-23T01:00:00.000Z'),
    },
  ];
  const educationRecords = [
    {
      shortId: 'E-ONE001',
      category: 'education',
      content: '7/24 上課請準時出席',
      status: 'open',
      createdAt: Date.parse('2026-07-23T01:00:00.000Z'),
      expiresAt: Date.parse('2026-07-24T15:59:59.999Z'),
    },
  ];
  const listCalls = [];
  const sender = createDailySummarySender({
    groupId: 'G-PRODUCTION',
    now: () => Date.parse('2026-07-24T00:00:00.000Z'),
    repository: {
      async listRecords(scope, filters) {
        listCalls.push({ scope, filters });
        return filters.category === 'handover'
          ? handoverRecords
          : educationRecords;
      },
      async removeExpiredEducationRecords(scope, activeAt) {
        assert.deepEqual(scope, { type: 'group', id: 'G-PRODUCTION' });
        assert.equal(activeAt, Date.parse('2026-07-24T00:00:00.000Z'));
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
    educationCount: 1,
  });
  assert.equal(listCalls.length, 2);
  assert.equal(listCalls[0].filters.category, 'handover');
  assert.equal(listCalls[1].filters.category, 'education');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.to, 'G-PRODUCTION');
  assert.equal(calls[0].request.messages.length, 2);
  assert.equal(calls[0].request.messages[0].type, 'flex');
  assert.equal(calls[0].request.messages[1].type, 'flex');
  assert.match(calls[0].retryKey, /^[0-9a-f-]{36}$/);
});

test('沒有未處理交班時仍會推播清空摘要', async () => {
  let pushedMessages;
  const sender = createDailySummarySender({
    groupId: 'G-PRODUCTION',
    repository: {
      async listRecords(_scope, filters) {
        return filters.category === 'handover'
          ? []
          : [
              {
                shortId: 'E-ONE001',
                category: 'education',
                content: '7/24 上課請準時出席',
                status: 'open',
                createdAt: Date.parse('2026-07-23T01:00:00.000Z'),
                expiresAt: Date.parse('2026-07-24T15:59:59.999Z'),
              },
            ];
      },
      async removeExpiredEducationRecords() {},
    },
    client: {
      async pushMessage(request) {
        pushedMessages = request.messages;
      },
    },
    now: () => Date.parse('2026-07-24T00:00:00.000Z'),
  });

  await sender();

  assert.equal(pushedMessages.length, 2);
  assert.deepEqual(pushedMessages[0], {
    type: 'text',
    text: '今日沒有未處理交班事項。',
  });
  assert.equal(pushedMessages[1].type, 'flex');
});

test('非當天課程不會出現在每日提醒', () => {
  const messages = buildDailyMessages(
    [],
    [
      {
        shortId: 'E-FUTURE',
        category: 'education',
        content: '7/25 上課',
        status: 'open',
        createdAt: Date.parse('2026-07-24T00:00:00.000Z'),
        expiresAt: Date.parse('2026-07-25T15:59:59.999Z'),
      },
    ],
    Date.parse('2026-07-24T00:00:00.000Z'),
  );

  assert.equal(messages.length, 2);
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
