const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createHandbookSopPublisher,
  createSopId,
  createSopTitle,
  removeAllMention,
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

test('轉入 SOP 時會移除 @All 群組標註', () => {
  assert.equal(removeAllMention('@All 請留意公告'), '請留意公告');
  assert.equal(removeAllMention('提醒 @all：請留意公告'), '提醒：請留意公告');
  assert.equal(
    removeAllMention('聯絡信箱 test@all.example.com'),
    '聯絡信箱 test@all.example.com',
  );
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
      content: '@All 測試公告',
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

test('多張公告圖片會全部上傳並依序放入 SOP', async () => {
  let created;
  const uploadBodies = [];
  const firestore = {
    collection() {
      return {
        doc() {
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
      const body = JSON.parse(options.body);
      uploadBodies.push(body);
      return {
        ok: true,
        async json() {
          return {
            status: 'success',
            url: `https://drive.google.com/file/d/IMAGE-${uploadBodies.length}/view`,
          };
        },
      };
    },
  });

  const result = await publisher.publishNotice({
    groupId: 'G1',
    actorName: '王藥師',
    record: {
      shortId: 'N-MULTI1',
      category: 'notice',
      content: '多圖公告',
    },
    images: [
      { buffer: Buffer.from('image-1'), contentType: 'image/jpeg' },
      { buffer: Buffer.from('image-2'), contentType: 'image/png' },
      { buffer: Buffer.from('image-3'), contentType: 'image/jpeg' },
    ],
  });

  assert.equal(uploadBodies.length, 3);
  assert.deepEqual(
    uploadBodies.map((body) => body.fileName),
    [
      'LINE公告-N-MULTI1-1.jpg',
      'LINE公告-N-MULTI1-2.png',
      'LINE公告-N-MULTI1-3.jpg',
    ],
  );
  assert.match(
    created.content,
    /!\[公告圖片 1\]\(https:\/\/drive\.google\.com\/file\/d\/IMAGE-1\/view\)/u,
  );
  assert.match(
    created.content,
    /!\[公告圖片 2\]\(https:\/\/drive\.google\.com\/file\/d\/IMAGE-2\/view\)/u,
  );
  assert.equal(
    created.attachmentUrl,
    'https://drive.google.com/file/d/IMAGE-3/view',
  );
  assert.equal(result.attachmentUrl, created.attachmentUrl);
});

test('重新轉 SOP 時會沿用文件 ID 並覆寫文字與全部圖片', async () => {
  let updated;
  let createCalled = false;
  let uploadCount = 0;
  const firestore = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: true };
            },
            async create() {
              createCalled = true;
            },
            async set(data, options) {
              updated = { data, options };
            },
          };
        },
      };
    },
  };
  const publisher = createHandbookSopPublisher({
    firestore,
    gasApiUrl: 'https://example.test/upload',
    fetchImpl: async () => {
      uploadCount += 1;
      return {
        ok: true,
        async json() {
          return {
            status: 'success',
            url: `https://drive.google.com/file/d/REPLACED-${uploadCount}/view`,
          };
        },
      };
    },
  });

  const result = await publisher.publishNotice({
    groupId: 'G1',
    actorName: '洪主任',
    replaceExisting: true,
    record: {
      shortId: 'N-REPLACE1',
      category: 'notice',
      content: '@All 更新後公告',
    },
    images: [
      { buffer: Buffer.from('image-1'), contentType: 'image/jpeg' },
      { buffer: Buffer.from('image-2'), contentType: 'image/jpeg' },
    ],
  });

  assert.equal(createCalled, false);
  assert.equal(uploadCount, 2);
  assert.deepEqual(updated.options, { merge: true });
  assert.match(updated.data.content, /^更新後公告/u);
  assert.match(updated.data.content, /REPLACED-1/u);
  assert.match(updated.data.attachmentUrl, /REPLACED-2/u);
  assert.equal(updated.data.updatedByName, 'LINE：洪主任');
  assert.equal(result.alreadyExists, false);
  assert.equal(result.replaced, true);
});
