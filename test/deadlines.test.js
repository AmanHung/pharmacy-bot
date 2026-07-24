const test = require('node:test');
const assert = require('node:assert/strict');
const { extractNoticeDeadline } = require('../src/deadlines');

test('解析公告截止日期並移除控制文字', () => {
  assert.deepEqual(
    extractNoticeDeadline('7 月盤點提醒 #到期 2026-07-31'),
    {
      content: '7 月盤點提醒',
      expiresAt: Date.UTC(2026, 6, 31, 15, 59, 59, 999),
    },
  );
});

test('拒絕無效公告截止日期', () => {
  assert.deepEqual(extractNoticeDeadline('提醒 #到期 2026-02-30'), {
    error: 'invalid-notice-deadline',
  });
  assert.deepEqual(extractNoticeDeadline('提醒 #到期 7/31'), {
    error: 'invalid-notice-deadline',
  });
});
