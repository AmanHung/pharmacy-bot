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
      content: '測試公告',
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
    },
  );
});

test('已驗證群組成員可以讀取紀錄及圖片', async (context) => {
  const router = createLiffRouter({
    groupId: 'G1',
    authorize: async () => ({
      userId: 'U1',
      displayName: '王藥師',
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
