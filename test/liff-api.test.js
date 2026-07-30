const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createLiffRouter, serializeRecord } = require('../src/liff-api');

async function startRouter(router) {
  const app = express();
  app.use('/api/liff', router);
  const server = app.listen(0);
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('LIFF 紀錄不暴露群組 ID 或圖片儲存路徑', () => {
  assert.deepEqual(
    serializeRecord({
      shortId: 'N-ONE001',
      category: 'notice',
      content: '@All 測試公告',
      authorName: '王藥師',
      createdAt: 1000,
      sourceImagePath: 'private/image.jpg',
      sourceImageExpiresAt: 2000,
      sourceId: 'G1',
    }, 1500),
    {
      shortId: 'N-ONE001',
      category: 'notice',
      content: '測試公告',
      authorName: null,
      createdAt: 1000,
      expiresAt: null,
      hasImage: true,
      sourceUrl: null,
      convertedToSopAt: null,
      convertedToSopByName: null,
    },
  );
});

test('已驗證群組成員可以讀取紀錄及圖片', async (context) => {
  const router = createLiffRouter({
    groupId: 'G1',
    authorize: async () => ({
      userId: 'U1',
      displayName: '王藥師',
      groupId: 'G1',
    }),
    repository: {
      async removeExpiredEducationRecords() {},
      async listRecords(scope) {
        assert.deepEqual(scope, { type: 'group', id: 'G1' });
        return [
          {
            shortId: 'N-ONE001',
            category: 'notice',
            content: '測試公告',
            createdAt: 1000,
            sourceImagePath: 'private/image.jpg',
            sourceImageExpiresAt: Date.now() + 100000,
          },
        ];
      },
      async getRecordByShortId() {
        return {
          shortId: 'N-ONE001',
          sourceImagePath: 'private/image.jpg',
        };
      },
    },
    imageStorage: {
      async readImage(path) {
        assert.equal(path, 'private/image.jpg');
        return {
          buffer: Buffer.from('image'),
          contentType: 'image/jpeg',
        };
      },
    },
  });
  const server = await startRouter(router);
  context.after(server.close);

  const recordsResponse = await fetch(`${server.baseUrl}/api/liff/records`);
  const recordsPayload = await recordsResponse.json();
  assert.equal(recordsResponse.status, 200);
  assert.equal(recordsPayload.displayName, '王藥師');
  assert.equal(recordsPayload.records[0].hasImage, true);

  const imageResponse = await fetch(
    `${server.baseUrl}/api/liff/images/N-ONE001`,
  );
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(await imageResponse.text(), 'image');
});

test('LIFF 已處理操作會記錄操作者身分', async (context) => {
  let completion;
  const router = createLiffRouter({
    groupId: 'G1',
    authorize: async () => ({
      userId: 'U1',
      displayName: '王藥師',
      groupId: 'G1',
    }),
    repository: {
      async completeRecord(scope, shortId, details) {
        completion = { scope, shortId, details };
        return { shortId, category: 'handover' };
      },
    },
    imageStorage: null,
  });
  const server = await startRouter(router);
  context.after(server.close);

  const response = await fetch(
    `${server.baseUrl}/api/liff/records/H-ONE001/complete`,
    { method: 'POST' },
  );

  assert.equal(response.status, 200);
  assert.equal(completion.shortId, 'H-ONE001');
  assert.equal(completion.details.completedByUserId, 'U1');
  assert.equal(completion.details.completedByName, '王藥師');
});

test('LIFF 最近處理區顯示操作者並可恢復紀錄', async (context) => {
  let restoration;
  const router = createLiffRouter({
    groupId: 'G1',
    authorize: async () => ({
      userId: 'U1',
      displayName: '王藥師',
      groupId: 'G1',
    }),
    repository: {
      async removeCompletedRecordsBefore() {
        return 0;
      },
      async listCompletedRecords(scope, filters) {
        assert.deepEqual(scope, { type: 'group', id: 'G1' });
        assert.ok(filters.completedSince < Date.now());
        return [
          {
            shortId: 'H-DONE01',
            category: 'handover',
            content: '已完成交班',
            authorName: '李藥師',
            createdAt: 1000,
            status: 'completed',
            completedAt: 2000,
            completedByName: '王藥師',
          },
        ];
      },
      async restoreRecord(scope, shortId, details) {
        restoration = { scope, shortId, details };
        return {
          shortId,
          category: 'handover',
          content: '已完成交班',
          authorName: '李藥師',
          createdAt: 1000,
          status: 'open',
        };
      },
    },
    imageStorage: null,
  });
  const server = await startRouter(router);
  context.after(server.close);

  const historyResponse = await fetch(`${server.baseUrl}/api/liff/history`);
  const historyPayload = await historyResponse.json();
  assert.equal(historyResponse.status, 200);
  assert.equal(historyPayload.records[0].completedByName, '王藥師');
  assert.equal(historyPayload.records[0].status, 'completed');

  const restoreResponse = await fetch(
    `${server.baseUrl}/api/liff/records/H-DONE01/restore`,
    { method: 'POST' },
  );
  const restorePayload = await restoreResponse.json();
  assert.equal(restoreResponse.status, 200);
  assert.equal(restoration.shortId, 'H-DONE01');
  assert.equal(restoration.details.restoredByName, '王藥師');
  assert.equal(restorePayload.record.shortId, 'H-DONE01');
});

test('LIFF 公告可連同私有圖片轉入新人導航系統 SOP', async (context) => {
  let published;
  let marked;
  const router = createLiffRouter({
    authorize: async () => ({
      userId: 'U1',
      displayName: '王藥師',
      groupId: 'G1',
    }),
    repository: {
      async getRecordByShortId(scope, shortId) {
        assert.deepEqual(scope, { type: 'group', id: 'G1' });
        assert.equal(shortId, 'N-ONE001');
        return {
          shortId,
          category: 'notice',
          content: '測試公告',
          createdAt: 1000,
          sourceImagePath: 'pharmacy_images/group/message-1',
        };
      },
      async markRecordConvertedToSop(scope, shortId, details) {
        marked = { scope, shortId, details };
        return {
          shortId,
          category: 'notice',
          content: '測試公告',
          createdAt: 1000,
          convertedToSopAt: details.convertedToSopAt,
          convertedToSopByName: details.convertedToSopByName,
        };
      },
    },
    imageStorage: {
      async readImage(path) {
        assert.equal(path, 'pharmacy_images/group/message-1');
        return {
          buffer: Buffer.from('image'),
          contentType: 'image/jpeg',
        };
      },
    },
    sopPublisher: {
      async publishNotice(input) {
        published = input;
        return { id: 'line-notice-test', alreadyExists: false };
      },
    },
  });
  const server = await startRouter(router);
  context.after(server.close);

  const response = await fetch(
    `${server.baseUrl}/api/liff/records/N-ONE001/convert-to-sop`,
    { method: 'POST' },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(published.actorName, '王藥師');
  assert.equal(published.record.content, '測試公告');
  assert.equal(published.image.buffer.toString(), 'image');
  assert.equal(marked.details.handbookSopId, 'line-notice-test');
  assert.equal(marked.details.convertedToSopByUserId, 'U1');
  assert.equal(payload.sopId, 'line-notice-test');
  assert.equal(payload.record.convertedToSopByName, '王藥師');
});

test('最近處理永久清除時同步刪除所屬圖片', async (context) => {
  let deletedImagePath;
  const router = createLiffRouter({
    authorize: async () => ({
      userId: 'U1',
      displayName: '王藥師',
      groupId: 'G1',
    }),
    repository: {
      async removeCompletedRecordsBefore(_scope, _cutoff, options) {
        await options.onRemove({
          sourceImagePath: 'pharmacy_images/group/message-1',
        });
        return 1;
      },
      async listCompletedRecords() {
        return [];
      },
    },
    imageStorage: {
      async deleteImage(path) {
        deletedImagePath = path;
      },
    },
  });
  const server = await startRouter(router);
  context.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/liff/history`);

  assert.equal(response.status, 200);
  assert.equal(
    deletedImagePath,
    'pharmacy_images/group/message-1',
  );
});
