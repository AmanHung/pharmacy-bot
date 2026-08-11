const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventHandler } = require('../src/event-handler');
const { createJoinMessage } = require('../src/messages');

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
    async completeHandoverBySourceMessageId() {
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

test('回覆原交班並輸入完成關鍵字會靜默標記已處理', async () => {
  let completion;
  const { handler, replies } = createFixtures({
    async completeHandoverBySourceMessageId(scope, messageId, details) {
      completion = { scope, messageId, details };
      return {
        shortId: 'H-000001',
        category: 'handover',
        status: 'completed',
      };
    },
  });
  const event = textEvent('已處理，謝謝');
  event.message.quotedMessageId = 'handover-message-1';

  await handler(event);

  assert.deepEqual(completion, {
    scope: { type: 'group', id: 'G1' },
    messageId: 'handover-message-1',
    details: {
      completedAt: 1721779200000,
      completedByUserId: 'U1',
      completedByName: '王藥師',
    },
  });
  assert.equal(replies.length, 0);
});

test('一般討論回覆不會誤標交班完成', async () => {
  let completeCount = 0;
  const { handler, replies } = createFixtures({
    async completeHandoverBySourceMessageId() {
      completeCount += 1;
    },
  });
  const event = textEvent('請問這個要怎麼處理？');
  event.message.quotedMessageId = 'handover-message-1';

  await handler(event);

  assert.equal(completeCount, 0);
  assert.equal(replies.length, 0);
});

test('否定完成狀態的回覆不會誤標交班完成', async () => {
  let completeCount = 0;
  const { handler } = createFixtures({
    async completeHandoverBySourceMessageId() {
      completeCount += 1;
    },
  });
  const event = textEvent('還沒處理完成');
  event.message.quotedMessageId = 'handover-message-1';

  await handler(event);

  assert.equal(completeCount, 0);
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
    ...createJoinMessage(null),
  });
});

test('加入群組時提供可釘選的私人資訊中心說明', async () => {
  const { handler, replies } = createFixtures(
    {},
    { liffId: '123456-test' },
  );

  await handler({
    type: 'join',
    replyToken: 'reply-token',
    timestamp: 1721779199000,
    source: { type: 'group', groupId: 'G1' },
  });

  const message = replies[0].messages[0];
  const serialized = JSON.stringify(message);
  assert.equal(message.type, 'flex');
  assert.match(serialized, /開啟本群組資訊中心/);
  assert.match(serialized, /https:\/\/liff\.line\.me\/123456-test\?groupId=G1/);
  assert.match(serialized, /自動記錄關鍵字/);
  assert.match(serialized, /每日 08:00～09:00 間推播/);
  assert.doesNotMatch(serialized, /設為公告/);
  assert.doesNotMatch(serialized, /輸入 \/help/);
  assert.match(serialized, /只限目前仍在本群組的成員查看/);
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

test('標註個別群組成員的訊息會自動記錄為交班', async () => {
  let savedRecord;
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });
  const event = textEvent('@惠珠 廠商明天會更換設備');
  event.message.mention = {
    mentionees: [
      {
        index: 0,
        length: 3,
        type: 'user',
        userId: 'UMEMBER',
        isSelf: false,
      },
    ],
  };

  await handler(event);

  assert.equal(savedRecord.category, 'handover');
  assert.equal(savedRecord.content, '@惠珠 廠商明天會更換設備');
});

test('標註成員的訊息仍優先採用明確分類關鍵字', async () => {
  let savedRecord;
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });
  const event = textEvent('@惠珠 川芎茶調散鎖檔');
  event.message.mention = {
    mentionees: [
      {
        index: 0,
        length: 3,
        type: 'user',
        userId: 'UMEMBER',
        isSelf: false,
      },
    ],
  };

  await handler(event);

  assert.equal(savedRecord.category, 'medication');
});

test('/help 會回覆功能選單', async () => {
  const { handler, replies } = createFixtures();

  await handler(textEvent('/help'));

  assert.equal(replies.length, 1);
  assert.equal(replies[0].messages[0].type, 'flex');
  assert.match(replies[0].messages[0].altText, /功能選單/);
});

test('/介紹 會重送可釘選的資訊中心說明', async () => {
  const { handler, replies } = createFixtures(
    {},
    { liffId: '123456-test' },
  );

  await handler(textEvent('/介紹'));

  assert.equal(replies.length, 1);
  const serialized = JSON.stringify(replies[0].messages[0]);
  assert.match(serialized, /開啟本群組資訊中心/);
  assert.match(serialized, /自動記錄關鍵字/);
  assert.doesNotMatch(serialized, /設為公告/);
});

test('新增指令會保存分類資料且不產生群組回覆', async () => {
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
  assert.deepEqual(readReceipts, []);
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
  assert.equal(readReceipts.length, 0);
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

test('引用圖片會保存私有圖片路徑供 LIFF 使用', async () => {
  let savedReference;
  let savedRecord;
  const { handler } = createFixtures(
    {
      async saveMessageReference(_scope, _messageId, reference) {
        savedReference = reference;
      },
      async getMessageReference() {
        return savedReference;
      },
      async saveRecord(_scope, _eventKey, record) {
        savedRecord = record;
        return { record, duplicate: false };
      },
    },
    {
      imageStorage: {
        async saveLineImage(scope, messageId) {
          assert.deepEqual(scope, { type: 'group', id: 'G1' });
          assert.equal(messageId, 'image-message-2');
          return {
            storagePath: 'pharmacy-images/G1/image-message-2.jpg',
            contentType: 'image/jpeg',
            size: 123,
          };
        },
      },
    },
  );

  await handler({
    type: 'message',
    timestamp: 1721779199000,
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    message: {
      type: 'image',
      id: 'image-message-2',
      quoteToken: 'image-quote-token-2',
    },
  });

  const event = textEvent('/n 請參考圖片說明');
  event.message.quotedMessageId = 'image-message-2';
  await handler(event);

  assert.equal(
    savedRecord.sourceImagePath,
    'pharmacy-images/G1/image-message-2.jpg',
  );
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

test('replied native notes without a captured reference can be saved as a tag', async () => {
  let savedRecord;
  const { handler, replies, readReceipts } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });
  const event = textEvent('/e 上課公告');
  event.message.quotedMessageId = 'native-note-message-1';

  await handler(event);

  assert.equal(savedRecord.category, 'education');
  assert.equal(savedRecord.content, '上課公告');
  assert.equal(savedRecord.sourceReferenceMessageId, undefined);
  assert.equal(replies.length, 0);
  assert.equal(readReceipts.length, 0);
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

test('完成指令會更新指定事項且不產生群組回覆', async () => {
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
  assert.equal(readReceipts.length, 0);
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

test('deleting a non-handover record from a query card is silent', async () => {
  const { handler, replies } = createFixtures({
    async completeRecord(_scope, shortId) {
      return {
        shortId,
        category: 'notice',
        content: '測試公告',
        status: 'completed',
      };
    },
  });

  await handler({
    type: 'postback',
    replyToken: 'reply-token',
    timestamp: 1721779200000,
    source: { type: 'group', groupId: 'G1', userId: 'U1' },
    postback: { data: 'action=complete&id=N-ABC123' },
  });

  assert.equal(replies.length, 0);
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

test('messages containing medication keywords are recorded silently', async () => {
  let savedRecord;
  const { handler, replies, readReceipts } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('缺藥：Cefazolin 目前無庫存'));

  assert.equal(savedRecord.category, 'medication');
  assert.equal(savedRecord.content, '缺藥：Cefazolin 目前無庫存');
  assert.equal(replies.length, 0);
  assert.equal(readReceipts.length, 0);
});

test('鎖檔與開檔關鍵字會自動記錄為缺換藥', async () => {
  const saved = [];
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      saved.push(record);
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('Metformin 今日鎖檔'));
  await handler(
    textEvent('Metformin 已恢復開檔', {
      webhookEventId: '01EVENTABC124',
      message: {
        ...textEvent('').message,
        id: 'message-2',
        text: 'Metformin 已恢復開檔',
      },
    }),
  );

  assert.equal(saved.length, 2);
  assert.deepEqual(
    saved.map((record) => record.category),
    ['medication', 'medication'],
  );
});

test('negative medication statements are not recorded automatically', async () => {
  let saveCount = 0;
  const { handler } = createFixtures({
    async saveRecord() {
      saveCount += 1;
      return { duplicate: false };
    },
  });

  await handler(textEvent('目前沒有缺藥'));
  await handler(textEvent('本週不用換藥'));

  assert.equal(saveCount, 0);
});

test('handover, education, and notice keywords select their matching categories', async () => {
  const savedCategories = [];
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedCategories.push(record.category);
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('夜班交班：待確認住院藥品'));
  await handler(textEvent('下週上課時間已確認'));
  await handler(textEvent('重要公告：請同仁閱讀'));
  await handler(
    textEvent('@All 請同仁閱讀最新通知', {
      webhookEventId: '01EVENTNOTICEALL',
      message: {
        ...textEvent('').message,
        id: 'message-notice-all',
        text: '@All 請同仁閱讀最新通知',
      },
    }),
  );
  await handler(
    textEvent('@all 請再次確認', {
      webhookEventId: '01EVENTNOTICELOWER',
      message: {
        ...textEvent('').message,
        id: 'message-notice-lower',
        text: '@all 請再次確認',
      },
    }),
  );

  assert.deepEqual(savedCategories, [
    'handover',
    'education',
    'notice',
    'notice',
    'notice',
  ]);
});

test('公告寫入資訊中心時會移除 @All 標記', async () => {
  const savedContents = [];
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedContents.push(record.content);
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('@All 請同仁閱讀最新通知'));
  await handler(
    textEvent('/n @all 系統公告', {
      webhookEventId: '01EVENTNOTICEWITHOUTALL',
      message: {
        ...textEvent('').message,
        id: 'message-notice-without-all',
        text: '/n @all 系統公告',
      },
    }),
  );

  assert.deepEqual(savedContents, [
    '請同仁閱讀最新通知',
    '系統公告',
  ]);
});

test('when automatic keywords overlap, medication takes priority', async () => {
  let savedRecord;
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });

  await handler(textEvent('缺藥公告：請交班同仁注意'));

  assert.equal(savedRecord.category, 'medication');
});

test('education records save an expiry time parsed from their course date', async () => {
  let savedRecord;
  const { handler } = createFixtures({
    async saveRecord(_scope, _eventKey, record) {
      savedRecord = record;
      return { record, duplicate: false };
    },
  });
  const event = textEvent('/e 8/4 上課請登記');
  event.timestamp = Date.UTC(2026, 6, 24, 8, 0, 0);

  await handler(event);

  assert.equal(savedRecord.category, 'education');
  assert.equal(
    savedRecord.expiresAt,
    Date.UTC(2026, 7, 4, 15, 59, 59, 999),
  );
});

test('education queries remove expired education records before listing', async () => {
  let expiryRequest;
  const { handler } = createFixtures({
    async removeExpiredEducationRecords(scope, activeAt) {
      expiryRequest = { scope, activeAt };
    },
  });

  await handler(textEvent('/q e'));

  assert.deepEqual(expiryRequest, {
    scope: { type: 'group', id: 'G1' },
    activeAt: 1721779200000,
  });
});

test('replying to one image records the complete LINE image set metadata', async () => {
  const references = new Map();
  let savedRecord;
  const { handler } = createFixtures(
    {
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
    },
    {
      imageStorage: {
        async saveLineImage(_scope, messageId) {
          return {
            storagePath: `pharmacy-images/G1/${messageId}.jpg`,
            contentType: 'image/jpeg',
            size: 100,
          };
        },
      },
    },
  );

  for (const index of [3, 1, 2]) {
    await handler({
      type: 'message',
      timestamp: 1721779199000 + index,
      source: { type: 'group', groupId: 'G1', userId: 'U1' },
      message: {
        type: 'image',
        id: `image-message-${index}`,
        quoteToken: `image-quote-token-${index}`,
        imageSet: { id: 'LINE-IMAGE-SET-1', index, total: 3 },
      },
    });
  }

  const event = textEvent('/n 多圖公告');
  event.message.quotedMessageId = 'image-message-2';
  await handler(event);

  assert.equal(references.size, 3);
  assert.deepEqual(
    [...references.values()].map((reference) => reference.imageSetIndex),
    [3, 1, 2],
  );
  assert.equal(savedRecord.sourceImageSetId, 'LINE-IMAGE-SET-1');
  assert.equal(savedRecord.sourceImageCount, 3);
  assert.equal(
    savedRecord.sourceImagePath,
    'pharmacy-images/G1/image-message-2.jpg',
  );
});
