const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand } = require('../src/commands');

test('一般聊天會被忽略', () => {
  assert.deepEqual(parseCommand('今天下午要開會'), { type: 'ignore' });
});

test('解析英文與中文新增指令', () => {
  assert.deepEqual(parseCommand('/h 明早確認冷藏溫度'), {
    type: 'add',
    category: 'handover',
    content: '明早確認冷藏溫度',
  });
  assert.deepEqual(parseCommand('／缺 Cefazolin 缺貨'), {
    type: 'add',
    category: 'medication',
    content: 'Cefazolin 缺貨',
  });
  assert.deepEqual(parseCommand('/e 北區藥學研討會'), {
    type: 'add',
    category: 'education',
    content: '北區藥學研討會',
  });
});

test('解析分類及關鍵字查詢', () => {
  assert.deepEqual(parseCommand('/q m cefazolin'), {
    type: 'query',
    category: 'medication',
    keyword: 'cefazolin',
  });
  assert.deepEqual(parseCommand('/查 冷藏'), {
    type: 'query',
    category: null,
    keyword: '冷藏',
  });
});

test('已移除未完成事項查詢指令', () => {
  assert.deepEqual(parseCommand('/open m cefazolin'), {
    type: 'invalid',
    reason: 'unknown-command',
  });
  assert.deepEqual(parseCommand('/未完成 交班'), {
    type: 'invalid',
    reason: 'unknown-command',
  });
});

test('解析完成與說明指令', () => {
  assert.deepEqual(parseCommand('/done m-abc123'), {
    type: 'complete',
    shortId: 'M-ABC123',
  });
  assert.deepEqual(parseCommand('/help'), { type: 'help' });
});

test('解析可重送釘選說明的介紹指令', () => {
  assert.deepEqual(parseCommand('/介紹'), { type: 'intro' });
  assert.deepEqual(parseCommand('/welcome'), { type: 'intro' });
});

test('無效指令會回傳原因', () => {
  assert.deepEqual(parseCommand('/'), {
    type: 'invalid',
    reason: 'empty-command',
  });
  assert.deepEqual(parseCommand('/unknown'), {
    type: 'invalid',
    reason: 'unknown-command',
  });
});
