const test = require('node:test');
const assert = require('node:assert/strict');
const {
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

test('缺換藥與公告不顯示登錄者但交班保留', () => {
  assert.doesNotMatch(formatSavedRecord(record(1)), /王藥師/);
  assert.match(formatSavedRecord(record(1, 'handover')), /王藥師/);
});
