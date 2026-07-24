const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventHandler } = require('../src/event-handler');

function createFixtures(repositoryOverrides = {}) {
  const replies = [];
  const client = {
    async getGroupMemberProfile(groupId, userId) {
      assert.equal(groupId, 'G1');
      assert.equal(userId, 'U1');
      return { displayName: '王藥師' };
    },
    async replyMessage(payload) {
      replies.push(payload);
      return {};
    },
  };
  const repository = {
    async saveRecord(_scope, _eventKey, record) {
      return { record, duplicate: false };
    },
    async listRecords() {
      return [];
    },
    async completeRecord() {
      return null;
    },
    async withdrawRecordByMessageId() {},
    ...repositoryOverrides,
  };
  const handler = createEventHandler({
    client,
    repository,
    now: () => 1721779200000,
  });

  return { client, handler, replies, repository };
}

function textEvent(text, overrides = {}) {
  return {
    type: 'message',
    replyToken: 'reply-token',
    timestamp: 1721779200000,
    webhookEventId: '01EVENTABC123',
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    message: { type: 'text', id: 'message-1', text },
    ...overrides,
  };
}

test('一般群組聊天不儲存也不回覆', async () => {
  let saveCount = 0;
  const { handler, replies } = createFixtures({
    async saveRecord() {
      saveCount += 1;
    },
  });

  await handler(textEvent('這是一般群組聊天'));

  assert.equal(saveCount, 0);
  assert.equal(replies.length, 0);
});

test('新增指令會使用群組成員名稱並保存分類資料', async () => {
  let saved;
  const { handler, replies } = createFixtures({
    async saveRecord(scope, eventKey, record) {
      saved = { scope, eventKey, record };
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('/m Cefazolin 1g 缺貨'));

  assert.deepEqual(saved.scope, { type: 'group', id: 'G1' });
  assert.equal(saved.eventKey, '01EVENTABC123');
  assert.equal(saved.record.category, 'medication');
  assert.equal(saved.record.authorName, '王藥師');
  assert.equal(saved.record.status, 'open');
  assert.match(saved.record.shortId, /^M-[A-Z0-9]{6}$/);
  assert.equal(replies.length, 1);
  assert.match(replies[0].messages[0].text, /已記錄缺換藥資訊/);
});

test('重複事件不再次回覆', async () => {
  const { handler, replies } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      return { record, duplicate: true };
    },
  });

  await handler(textEvent('/h 確認冷藏溫度'));

  assert.equal(replies.length, 0);
});

test('查詢指令會傳遞分類及關鍵字', async () => {
  let receivedFilters;
  const { handler, replies } = createFixtures({
    async listRecords(_scope, filters) {
      receivedFilters = filters;
      return [];
    },
  });

  await handler(textEvent('/q m cefazolin'));

  assert.deepEqual(receivedFilters, {
    category: 'medication',
    keyword: 'cefazolin',
    limit: 10,
  });
  assert.equal(replies[0].messages[0].text, '查無符合條件的資訊。');
});

test('完成指令會更新指定事項', async () => {
  let completion;
  const { handler, replies } = createFixtures({
    async completeRecord(scope, shortId, details) {
      completion = { scope, shortId, details };
      return {
        shortId,
        category: 'medication',
        content: 'Cefazolin 1g 缺貨',
        status: 'completed',
      };
    },
  });

  await handler(textEvent('/done m-abc123'));

  assert.deepEqual(completion.scope, { type: 'group', id: 'G1' });
  assert.equal(completion.shortId, 'M-ABC123');
  assert.equal(completion.details.completedByName, '王藥師');
  assert.equal(completion.details.completedByUserId, 'U1');
  assert.equal(replies[0].messages[0].text, '[M-ABC123] 已標記為完成。');
});

test('撤回事件會清除對應紀錄內容', async () => {
  let withdrawal;
  const { handler, replies } = createFixtures({
    async withdrawRecordByMessageId(scope, messageId, timestamp) {
      withdrawal = { scope, messageId, timestamp };
    },
  });

  await handler({
    type: 'unsend',
    timestamp: 1721779200000,
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    unsend: { messageId: 'message-1' },
  });

  assert.deepEqual(withdrawal, {
    scope: { type: 'group', id: 'G1' },
    messageId: 'message-1',
    timestamp: 1721779200000,
  });
  assert.equal(replies.length, 0);
});

test('群組白名單會忽略未授權群組', async () => {
  const replies = [];
  const handler = createEventHandler({
    client: {
      async replyMessage(payload) {
        replies.push(payload);
      },
    },
    repository: {},
    allowedGroupIds: new Set(['G2']),
  });

  await handler(textEvent('/help'));
  assert.equal(replies.length, 0);
});
