const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FUNCTION_MENU_MESSAGE,
  formatAge,
  formatCompletedRecord,
  formatQueryResult,
  formatSavedRecord,
} = require('../src/messages');

const DAY = 24 * 60 * 60 * 1000;

function record(index, category = 'medication') {
  return {
    shortId: `M-TEST0${index}`,
    category,
    content: `測試內容 ${index}`,
    authorName: '王藥師',
    status: 'open',
    createdAt: 10 * DAY - index,
  };
}

test('未完成事項會顯示存在天數及可能過期提示', () => {
  assert.equal(formatAge(9 * DAY, 10 * DAY), '已 1 天');
  assert.equal(formatAge(3 * DAY, 10 * DAY), '可能過期｜已 7 天');
});

test('查詢結果每頁五筆並提供下一頁', () => {
  const message = formatQueryResult(
    Array.from({ length: 6 }, (_, index) => record(index)),
    { type: 'query', category: 'medication', keyword: '' },
    { currentTime: 10 * DAY, page: 0 },
  );
  const serialized = JSON.stringify(message);

  assert.equal(message.type, 'flex');
  assert.match(message.altText, /第 1\/2 頁/);
  assert.match(serialized, /下一頁/);
  assert.doesNotMatch(serialized, /測試內容 5/);
});

test('缺換藥與公告顯示刪除按鈕，交班顯示已處理按鈕', () => {
  const medicationMessage = formatQueryResult(
    [record(1)],
    { type: 'query', category: 'medication', keyword: '' },
    { currentTime: 10 * DAY, page: 0 },
  );
  const noticeMessage = formatQueryResult(
    [record(2, 'notice')],
    { type: 'query', category: 'notice', keyword: '' },
    { currentTime: 10 * DAY, page: 0 },
  );
  const handoverMessage = formatQueryResult(
    [record(3, 'handover')],
    { type: 'query', category: 'handover', keyword: '' },
    { currentTime: 10 * DAY, page: 0 },
  );
  const serialized = JSON.stringify(medicationMessage);
  const visibleMetadata =
    medicationMessage.contents.body.contents[0].contents[0].text;

  assert.match(serialized, /"text":"刪除"/);
  assert.match(JSON.stringify(noticeMessage), /"text":"刪除"/);
  assert.match(JSON.stringify(handoverMessage), /"text":"已處理"/);
  assert.match(serialized, /"type":"postback"/);
  assert.match(serialized, /action=complete&id=M-TEST01/);
  assert.doesNotMatch(serialized, /\/done M-TEST01/);
  assert.doesNotMatch(visibleMetadata, /M-TEST01/);
  assert.doesNotMatch(serialized, /"type":"button"/);
});

test('功能選單可預填新增指令並直接執行查詢', () => {
  const serialized = JSON.stringify(FUNCTION_MENU_MESSAGE);

  assert.match(serialized, /"inputOption":"openKeyboard"/);
  assert.match(serialized, /"fillInText":"\/m "/);
  assert.match(serialized, /"fillInText":"\/e "/);
  assert.match(serialized, /action=query/);
  assert.match(serialized, /category=education/);
  assert.match(serialized, /對圖片使用/);
  assert.doesNotMatch(serialized, /所有未完成事項/);
  assert.equal(FUNCTION_MENU_MESSAGE.type, 'flex');
});

test('公告包含網址時提供可直接開啟的連結按鈕', () => {
  const noticeRecord = record(4, 'notice');
  noticeRecord.content =
    '教育訓練記事本 https://example.com/notes/123。';
  const message = formatQueryResult(
    [noticeRecord],
    { type: 'query', category: 'notice', keyword: '' },
    { currentTime: 10 * DAY, page: 0 },
  );
  const serialized = JSON.stringify(message);

  assert.match(serialized, /"text":"開啟連結"/);
  assert.match(serialized, /"type":"uri"/);
  assert.match(serialized, /"uri":"https:\/\/example.com\/notes\/123"/);
  assert.match(
    serialized,
    /"desktop":"https:\/\/example.com\/notes\/123"/,
  );
});

test('引用圖片的資訊會提供查看原圖按鈕', () => {
  const noticeRecord = record(5, 'notice');
  noticeRecord.sourceQuoteToken = 'quote-token-image';
  const message = formatQueryResult(
    [noticeRecord],
    { type: 'query', category: 'notice', keyword: '' },
    { currentTime: 10 * DAY, page: 0 },
  );
  const serialized = JSON.stringify(message);

  assert.match(serialized, /"text":"看原圖"/);
  assert.match(serialized, /action=view-source&id=M-TEST05/);
});

test('缺換藥與公告不顯示登錄者但交班保留', () => {
  assert.doesNotMatch(formatSavedRecord(record(1)), /王藥師/);
  assert.match(formatSavedRecord(record(1, 'handover')), /王藥師/);
});

test('處理結果顯示內容但不顯示編碼', () => {
  const handover = record(1, 'handover');
  const medication = record(2, 'medication');
  handover.completedByName = '王藥師';
  medication.completedByName = '李藥師';

  assert.equal(
    formatCompletedRecord(handover),
    '王藥師已處理：測試內容 1',
  );
  assert.equal(
    formatCompletedRecord(medication),
    '李藥師已刪除：測試內容 2',
  );
  assert.doesNotMatch(formatCompletedRecord(handover), /M-TEST01/);
});
