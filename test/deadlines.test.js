const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractEducationDeadline,
  extractNoticeDeadline,
} = require('../src/deadlines');

test('解析公告截止日期並移除控制文字', () => {
  assert.deepEqual(
    extractNoticeDeadline('7 月盤點提醒 #到期 2026-07-31'),
    {
      content: '7 月盤點提醒',
      expiresAt: Date.UTC(2026, 6, 31, 15, 59, 59, 999),
    },
  );
});

test('extracts education dates and rolls past month-day dates into the next year', () => {
  const beforeCourse = Date.UTC(2026, 6, 24, 8, 0, 0);
  assert.equal(
    extractEducationDeadline('8/4 上課請登記', beforeCourse),
    Date.UTC(2026, 7, 4, 15, 59, 59, 999),
  );
  assert.equal(
    extractEducationDeadline('1/3 課程', beforeCourse),
    Date.UTC(2027, 0, 3, 15, 59, 59, 999),
  );
  assert.equal(extractEducationDeadline('8/4 聚餐', beforeCourse), null);
  assert.equal(extractEducationDeadline('2/30 上課', beforeCourse), null);
});

test('拒絕無效公告截止日期', () => {
  assert.deepEqual(extractNoticeDeadline('提醒 #到期 2026-02-30'), {
    error: 'invalid-notice-deadline',
  });
  assert.deepEqual(extractNoticeDeadline('提醒 #到期 7/31'), {
    error: 'invalid-notice-deadline',
  });
});
