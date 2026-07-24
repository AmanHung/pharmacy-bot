const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCompletePostback,
  buildQueryPostback,
  parsePostback,
} = require('../src/postbacks');

test('完成按鈕資料可還原為完成動作', () => {
  const data = buildCompletePostback('M-ABC123');
  assert.deepEqual(parsePostback(data), {
    type: 'complete',
    shortId: 'M-ABC123',
  });
});

test('分頁按鈕資料可還原查詢條件', () => {
  const data = buildQueryPostback({
    mode: 'open-query',
    category: 'medication',
    keyword: 'Amoxicillin 缺貨',
    page: 2,
  });
  assert.deepEqual(parsePostback(data), {
    type: 'open-query',
    category: 'medication',
    keyword: 'Amoxicillin 缺貨',
    page: 2,
  });
});

test('未完成查詢分頁會保留模式且不超過 LINE 長度限制', () => {
  const data = buildQueryPostback({
    type: 'open-query',
    category: 'notice',
    keyword: '很長的中文關鍵字'.repeat(30),
    page: 1,
  });
  const action = parsePostback(data);

  assert.ok(data.length <= 300);
  assert.equal(action.type, 'open-query');
  assert.equal(action.category, 'notice');
  assert.equal(action.page, 1);
});
