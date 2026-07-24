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

test('搜尋會忽略大小寫、空白及標點差異', async () => {
  const repository = createRecordRepository(
    createDatabase([
      {
        shortId: 'M-DRUG01',
        category: 'medication',
        content: 'Amoxicillin / Clavulanate 暫時缺貨',
        authorName: '王藥師',
        status: 'open',
        createdAt: 1000,
      },
    ]),
  );

  const records = await repository.listRecords(
    { type: 'group', id: 'G1' },
    { keyword: 'amoxicillin-clavulanate', limit: 100 },
  );

  assert.equal(records.length, 1);
});

test('查詢會排除已到期公告', async () => {
  const repository = createRecordRepository(
    createDatabase([
      {
        shortId: 'N-OLD001',
        category: 'notice',
        content: '已過期公告',
        authorName: '王藥師',
        status: 'open',
        createdAt: 1000,
        expiresAt: 1999,
      },
      {
        shortId: 'N-NEW001',
        category: 'notice',
        content: '有效公告',
        authorName: '王藥師',
        status: 'open',
        createdAt: 1000,
        expiresAt: 3000,
      },
    ]),
  );

  const records = await repository.listRecords(
    { type: 'group', id: 'G1' },
    { category: 'notice', activeAt: 2000, limit: 100 },
  );

  assert.deepEqual(
    records.map((record) => record.shortId),
    ['N-NEW001'],
  );
});

test('設定藥品別名後可用商品名查到學名內容', async () => {
  const repository = createRecordRepository(
    createDatabase([
      {
        shortId: 'M-DRUG02',
        category: 'medication',
        content: 'Amoxicillin/Clavulanate 暫時缺貨',
        authorName: '王藥師',
        status: 'open',
        createdAt: 1000,
      },
    ]),
    {
      drugAliases: [
        ['augmentin', '安滅菌', 'amoxicillinclavulanate'],
      ],
    },
  );

  const records = await repository.listRecords(
    { type: 'group', id: 'G1' },
    { keyword: '安滅菌', limit: 100 },
  );

  assert.equal(records.length, 1);
});

test('相同短編號存在多筆時優先完成最新的未完成紀錄', async () => {
  const records = {
    completed: {
      shortId: 'M-COLL01',
      status: 'completed',
      createdAt: 1000,
    },
    open: {
      shortId: 'M-COLL01',
      status: 'open',
      createdAt: 2000,
    },
  };
  let updatedKey;

  function createSnapshot(entries) {
    return {
      forEach(callback) {
        for (const [key, record] of entries) {
          callback({
            key,
            val() {
              return record;
            },
          });
        }
      },
    };
  }

  const query = {
    orderByChild() {
      return query;
    },
    limitToLast() {
      return query;
    },
    equalTo() {
      return query;
    },
    async once() {
      return createSnapshot(Object.entries(records));
    },
    child(key) {
      return {
        async transaction(update) {
          const nextRecord = update(records[key]);
          if (nextRecord === undefined) {
            return {
              committed: false,
              snapshot: { val: () => records[key] },
            };
          }
          updatedKey = key;
          records[key] = nextRecord;
          return {
            committed: true,
            snapshot: { val: () => records[key] },
          };
        },
      };
    },
  };

  const repository = createRecordRepository({
    ref() {
      return query;
    },
  });

  const result = await repository.completeRecord(
    { type: 'group', id: 'G1' },
    'M-COLL01',
    {
      completedAt: 3000,
      completedByUserId: 'U1',
      completedByName: '王藥師',
    },
  );

  assert.equal(updatedKey, 'open');
  assert.equal(result.status, 'completed');
  assert.equal(records.completed.createdAt, 1000);
});
