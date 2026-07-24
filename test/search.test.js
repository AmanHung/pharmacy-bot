const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSearchTerms,
  normalizeSearchText,
  parseDrugAliases,
} = require('../src/search');

test('搜尋文字會忽略空白、標點及大小寫', () => {
  assert.equal(
    normalizeSearchText('Amoxicillin / Clavulanate'),
    'amoxicillinclavulanate',
  );
});

test('藥品別名設定可展開為同一組搜尋詞', () => {
  const aliases = parseDrugAliases(
    '{"augmentin":["安滅菌","amoxicillin/clavulanate"]}',
  );

  assert.deepEqual(createSearchTerms('安滅菌', aliases), [
    'augmentin',
    '安滅菌',
    'amoxicillinclavulanate',
  ]);
});
