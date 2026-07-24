const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecordRepository } = require('../src/repository');

function createDatabase(records) {
  const snapshot = {
    exists() {
      return records.length > 0;
    },
    forEach(callback) {
      for (const record of records) {
        callback({
          val() {
            return record;
          },
        });
      }
    },
  };

  const query = {
    orderByChild() {
      return query;
    },
    limitToLast() {
      return query;
    },
    async once() {
      return snapshot;
    },
  };

  return {
    ref() {
      return query;
    },
  };
}

test('查詢結果依建立日期由新到舊排列', async () => {
  const repository = createRecordRepository(
    createDatabase([
      {
        shortId: 'H-OLD',
        category: 'handover',
        content: '較早交班',
        authorName: '甲',
        status: 'open',
        createdAt: 1000,
      },
      {
        shortId: 'H-NEW',
        category: 'handover',
        content: '較新交班',
        authorName: '乙',
        status: 'open',
        createdAt: 3000,
      },
      {
        shortId: 'H-MIDDLE',
        category: 'handover',
        content: '中間交班',
        authorName: '丙',
        status: 'open',
        createdAt: 2000,
      },
    ]),
  );

  const records = await repository.listRecords(
    { type: 'group', id: 'G1' },
    { limit: 100 },
  );

  assert.deepEqual(
    records.map((record) => record.shortId),
    ['H-NEW', 'H-MIDDLE', 'H-OLD'],
  );
});

test('交班日期範圍會排除七天以前的事項', async () => {
  const repository = createRecordRepository(
    createDatabase([
      {
        shortId: 'H-OLD',
        category: 'handover',
        content: '範圍外',
        authorName: '甲',
        status: 'open',
        createdAt: 999,
      },
      {
        shortId: 'H-RECENT',
        category: 'handover',
        content: '範圍內',
        authorName: '乙',
        status: 'open',
        createdAt: 1000,
      },
    ]),
  );

  const records = await repository.listRecords(
    { type: 'group', id: 'G1' },
    { category: 'handover', createdSince: 1000, limit: 100 },
  );

  assert.deepEqual(
    records.map((record) => record.shortId),
    ['H-RECENT'],
  );
});
