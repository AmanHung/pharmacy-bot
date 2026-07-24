const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FUNCTION_MENU_MESSAGE,
  formatAge,
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
  assert.match(serialized, /"type":"message"/);
  assert.match(serialized, /\/done M-TEST01/);
  assert.doesNotMatch(visibleMetadata, /M-TEST01/);
  assert.doesNotMatch(serialized, /"type":"button"/);
});

test('功能選單可預填新增指令並直接執行查詢', () => {
  const serialized = JSON.stringify(FUNCTION_MENU_MESSAGE);

  assert.match(serialized, /"inputOption":"openKeyboard"/);
  assert.match(serialized, /"fillInText":"\/m "/);
  assert.match(serialized, /action=query/);
  assert.equal(FUNCTION_MENU_MESSAGE.type, 'flex');
});

test('缺換藥與公告不顯示登錄者但交班保留', () => {
  assert.doesNotMatch(formatSavedRecord(record(1)), /王藥師/);
  assert.match(formatSavedRecord(record(1, 'handover')), /王藥師/);
});
