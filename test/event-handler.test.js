const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventHandler } = require('../src/event-handler');

function createFixtures(repositoryOverrides = {}, handlerOptions = {}) {
  const replies = [];
  const readReceipts = [];
  const client = {
    async getGroupSummary(groupId) {
      assert.equal(groupId, 'G1');
      return { groupName: '核心測試群組' };
    },
    async getGroupMemberProfile(groupId, userId) {
      assert.equal(groupId, 'G1');
      assert.equal(userId, 'U1');
      return { displayName: '王藥師' };
    },
    async replyMessage(payload) {
      replies.push(payload);
      return {};
    },
    async markMessagesAsReadByToken(payload) {
      readReceipts.push(payload);
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
    async registerScope() {},
    async completeRecord() {
      return null;
    },
    async getRecordByShortId() {
      return null;
    },
    async getMessageReference() {
      return null;
    },
    async saveMessageReference() {},
    async withdrawRecordByMessageId() {},
    ...repositoryOverrides,
  };
  const handler = createEventHandler({
    client,
    repository,
    now: () => 1721779200000,
    ...handlerOptions,
  });

  return { client, handler, readReceipts, replies, repository };
}

function textEvent(text, overrides = {}) {
  return {
    type: 'message',
    replyToken: 'reply-token',
    timestamp: 1721779200000,
    webhookEventId: '01EVENTABC123',
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    message: {
      type: 'text',
      id: 'message-1',
      text,
      markAsReadToken: 'mark-as-read-token',
    },
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

test('加入群組時回覆簡短功能介紹', async () => {
  let registeredScope;
  let registeredMetadata;
  const { handler, replies } = createFixtures({
    async registerScope(scope, metadata) {
      registeredScope = scope;
      registeredMetadata = metadata;
    },
  });
  const event = {
    type: 'join',
    replyToken: 'join-reply-token',
    timestamp: 1721779200000,
    source: { type: 'group', groupId: 'G1' },
  };

  await handler(event);

  assert.deepEqual(registeredScope, { type: 'group', id: 'G1' });
  assert.deepEqual(registeredMetadata, {
    groupName: '核心測試群組',
    registeredAt: 1721779200000,
  });
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].messages[0], {
    type: 'text',
    text: [
      '大家好，我是藥劑科資訊小幫手。',
      '可協助整理及查詢交班、缺換藥、公告與教育訓練資訊。',
      '輸入 /help，即可開啟功能選單。',
      '一般聊天不會被記錄，請安心使用。',
    ].join('\n'),
  });
});

test('@ 機器人時不自動回覆功能選單', async () => {
  const { handler, replies } = createFixtures();
  const event = textEvent('@藥劑科機器人');
  event.message.mention = {
    mentionees: [
      {
        index: 0,
        length: 8,
        type: 'user',
        userId: 'UBOT',
        isSelf: true,
      },
    ],
  };

  await handler(event);

  assert.equal(replies.length, 0);
});

test('/help 會回覆功能選單', async () => {
  const { handler, replies } = createFixtures();

  await handler(textEvent('/help'));

  assert.equal(replies.length, 1);
  assert.equal(replies[0].messages[0].type, 'flex');
  assert.match(replies[0].messages[0].altText, /功能選單/);
});

test('新增指令會保存分類資料並以已讀取代成功回覆', async () => {
  let saved;
  const { handler, readReceipts, replies } = createFixtures({
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
  assert.equal(replies.length, 0);
  assert.deepEqual(readReceipts, [
    { markAsReadToken: 'mark-as-read-token' },
  ]);
});

test('公告可設定截止日期且成功時不回覆', async () => {
  let saved;
  const { handler, readReceipts, replies } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      saved = record;
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('/n 盤點提醒 #到期 2024-07-31'));

  assert.equal(saved.content, '盤點提醒');
  assert.equal(saved.expiresAt, Date.UTC(2024, 6, 31, 15, 59, 59, 999));
  assert.equal(replies.length, 0);
  assert.equal(readReceipts.length, 1);
});

test('回覆圖片新增公告時會保存原圖引用資訊', async () => {
  let savedReference;
  let savedRecord;
  const { handler } = createFixtures({
    async saveMessageReference(scope, messageId, reference) {
      savedReference = { scope, messageId, reference };
    },
    async getMessageReference(_scope, messageId) {
      assert.equal(messageId, 'image-message-1');
      return savedReference.reference;
    },
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });

  await handler({
    type: 'message',
    timestamp: 1721779199000,
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    message: {
      type: 'image',
      id: 'image-message-1',
      quoteToken: 'image-quote-token',
    },
  });

  const event = textEvent('/n 請參考圖片說明');
  event.message.quotedMessageId = 'image-message-1';
  await handler(event);

  assert.deepEqual(savedReference, {
    scope: { type: 'group', id: 'G1' },
    messageId: 'image-message-1',
    reference: {
      type: 'image',
      quoteToken: 'image-quote-token',
      authorUserId: 'U1',
      createdAt: 1721779199000,
    },
  });
  assert.equal(savedRecord.sourceReferenceMessageId, 'image-message-1');
  assert.equal(savedRecord.sourceReferenceType, 'image');
  assert.equal(savedRecord.sourceQuoteToken, 'image-quote-token');
});

test('回覆含記事本連結的訊息新增教育訓練時會保存連結', async () => {
  let references = new Map();
  let savedRecord;
  const { handler } = createFixtures({
    async saveMessageReference(_scope, messageId, reference) {
      references.set(messageId, reference);
    },
    async getMessageReference(_scope, messageId) {
      return references.get(messageId) || null;
    },
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });

  await handler(
    textEvent('教育訓練記事本 https://line.me/R/note/example-note', {
      message: {
        type: 'text',
        id: 'note-message-1',
        text: '教育訓練記事本 https://line.me/R/note/example-note',
        quoteToken: 'note-quote-token',
      },
    }),
  );

  const event = textEvent('/e 下週三教育訓練');
  event.message.quotedMessageId = 'note-message-1';
  await handler(event);

  assert.equal(savedRecord.sourceReferenceType, 'text');
  assert.equal(savedRecord.sourceQuoteToken, 'note-quote-token');
  assert.equal(savedRecord.sourceUrl, 'https://line.me/R/note/example-note');
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
    limit: 100,
    activeAt: 1721779200000,
  });
  assert.equal(replies[0].messages[0].text, '查無符合條件的資訊。');
});

test('交班查詢只傳遞最近七天的範圍', async () => {
  let receivedFilters;
  const { handler } = createFixtures({
    async listRecords(_scope, filters) {
      receivedFilters = filters;
      return [];
    },
  });

  await handler(textEvent('/q h'));

  assert.deepEqual(receivedFilters, {
    category: 'handover',
    keyword: '',
    limit: 100,
    activeAt: 1721779200000,
    createdSince: 1721174400000,
  });
});

test('已移除未完成事項查詢指令', async () => {
  const { handler, replies } = createFixtures();

  await handler(textEvent('/open m cefazolin'));

  assert.equal(replies.length, 1);
  assert.match(replies[0].messages[0].text, /無法辨識指令/);
});

test('有結果的查詢會回覆可直接完成的 Flex Message', async () => {
  const { handler, replies } = createFixtures({
    async listRecords() {
      return [
        {
          shortId: 'M-ABC123',
          category: 'medication',
          content: 'Cefazolin 缺貨',
          authorName: '王藥師',
          status: 'open',
          createdAt: 1721779200000,
        },
      ];
    },
  });

  await handler(textEvent('/q m Cefazolin'));

  const message = replies[0].messages[0];
  assert.equal(message.type, 'flex');
  assert.match(message.altText, /缺換藥資訊/);
  assert.doesNotMatch(JSON.stringify(message), /王藥師/);
  assert.match(
    JSON.stringify(message),
    /action=complete&id=M-ABC123/,
  );
  assert.doesNotMatch(JSON.stringify(message), /\/done M-ABC123/);
});

test('交班查詢保留登錄者姓名', async () => {
  const { handler, replies } = createFixtures({
    async listRecords() {
      return [
        {
          shortId: 'H-ABC123',
          category: 'handover',
          content: '確認冷藏溫度',
          authorName: '王藥師',
          status: 'open',
          createdAt: 1721779200000,
        },
      ];
    },
  });

  await handler(textEvent('/q h'));

  assert.match(JSON.stringify(replies[0].messages[0]), /王藥師/);
});

test('完成指令會更新指定事項並以已讀取代成功回覆', async () => {
  let completion;
  const { handler, readReceipts, replies } = createFixtures({
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
  assert.equal(replies.length, 0);
  assert.equal(readReceipts.length, 1);
});

test('點擊查詢結果按鈕會以內容說明已處理事項', async () => {
  let completedId;
  const { handler, replies } = createFixtures({
    async completeRecord(_scope, shortId) {
      completedId = shortId;
      return {
        shortId,
        category: 'handover',
        content: '確認冷藏藥品庫存',
        completedByName: '王藥師',
        status: 'completed',
      };
    },
  });

  await handler({
    type: 'postback',
    replyToken: 'reply-token',
    timestamp: 1721779200000,
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    postback: { data: 'action=complete&id=M-ABC123' },
  });

  assert.equal(completedId, 'M-ABC123');
  assert.equal(replies.length, 1);
  assert.equal(
    replies[0].messages[0].text,
    '王藥師已處理：確認冷藏藥品庫存',
  );
  assert.doesNotMatch(replies[0].messages[0].text, /M-ABC123/);
});

test('點擊看原圖會以引用訊息帶回原始圖片', async () => {
  const { handler, replies } = createFixtures({
    async getRecordByShortId(_scope, shortId) {
      assert.equal(shortId, 'N-ABC123');
      return {
        shortId,
        category: 'notice',
        content: '請參考圖片說明',
        sourceReferenceType: 'image',
        sourceQuoteToken: 'image-quote-token',
      };
    },
  });

  await handler({
    type: 'postback',
    replyToken: 'reply-token',
    timestamp: 1721779200000,
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    postback: { data: 'action=view-source&id=N-ABC123' },
  });

  assert.deepEqual(replies[0].messages[0], {
    type: 'text',
    text: '原始圖片：請參考圖片說明',
    quoteToken: 'image-quote-token',
  });
});

test('設定管理者後拒絕未授權使用者完成事項', async () => {
  let completeCount = 0;
  const { handler, replies } = createFixtures(
    {
      async completeRecord() {
        completeCount += 1;
      },
    },
    { adminUserIds: new Set(['U2']) },
  );

  await handler(textEvent('/done M-ABC123'));

  assert.equal(completeCount, 0);
  assert.equal(replies[0].messages[0].text, '你沒有標記完成的權限。');
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
