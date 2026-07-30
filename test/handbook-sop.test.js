const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createHandbookSopPublisher,
  createSopId,
  createSopTitle,
} = require('../src/handbook-sop');

test('建立穩定且不暴露群組 ID 的 SOP 文件編號', () => {
  const id = createSopId('G-PRIVATE', 'N-ONE001');
  assert.match(id, /^line-notice-[a-f0-9]{24}$/u);
  assert.equal(id.includes('G-PRIVATE'), false);
});

test('公告標題會壓縮空白並限制長度', () => {
  assert.equal(createSopTitle('  測試\n公告  '), '測試 公告');
  assert.equal(createSopTitle(''), 'LINE 公告');
  assert.ok(createSopTitle('測'.repeat(80)).length <= 60);
});

test('公告文字與圖片會建立為 SOP 文件', async () => {
  let created;
  let requestedBody;
  const firestore = {
    collection(name) {
      assert.equal(name, 'sop_articles');
      return {
        doc(id) {
          assert.match(id, /^line-notice-/u);
          return {
            async get() {
              return { exists: false };
            },
            async create(data) {
              created = data;
            },
          };
        },
      };
    },
  };
  const publisher = createHandbookSopPublisher({
    firestore,
    gasApiUrl: 'https://example.test/upload',
    fetchImpl: async (_url, options) => {
      requestedBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            status: 'success',
            url: 'https://drive.google.com/file/d/IMAGE/view',
          };
        },
      };
    },
  });

  const result = await publisher.publishNotice({
    groupId: 'G1',
    actorName: '王藥師',
    record: {
      shortId: 'N-ONE001',
      category: 'notice',
      content: '測試公告',
      createdAt: 1000,
    },
    image: {
      buffer: Buffer.from('image'),
      contentType: 'image/jpeg',
    },
  });

  assert.equal(result.alreadyExists, false);
  assert.equal(requestedBody.action, 'upload_to_drive');
  assert.match(requestedBody.base64, /^data:image\/jpeg;base64,/u);
  assert.equal(created.title, '測試公告');
  assert.equal(created.category, '行政流程');
  assert.equal(created.content, '測試公告');
  assert.equal(
    created.attachmentUrl,
    'https://drive.google.com/file/d/IMAGE/view',
  );
  assert.equal(created.sourceSystem, 'pharmacy-bot');
  assert.equal(created.updatedByName, 'LINE：王藥師');
  assert.equal(created.updatedByUid, 'line-import');
});
