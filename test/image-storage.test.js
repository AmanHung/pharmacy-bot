const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
  createImageStorage,
  readableToBuffer,
} = require('../src/image-storage');

test('將 LINE 圖片串流轉為 Buffer', async () => {
  const buffer = await readableToBuffer(Readable.from(['abc', '123']));
  assert.equal(buffer.toString(), 'abc123');
});

test('將 LINE 圖片保存至群組專屬私有路徑', async () => {
  let saved;
  const imageStorage = createImageStorage({
    blobClient: {
      async getMessageContent(messageId) {
        assert.equal(messageId, 'message-1');
        return Readable.from([Buffer.from('image-data')]);
      },
    },
    database: {
      ref(path) {
        return {
          async set(value) {
            saved = { path, value };
          },
        };
      },
    },
  });

  const result = await imageStorage.saveLineImage(
    { type: 'group', id: 'G1' },
    'message-1',
  );

  assert.match(saved.path, /^pharmacy_images\//);
  assert.match(saved.path, /message-1$/);
  assert.equal(Buffer.from(saved.value.data, 'base64').toString(), 'image-data');
  assert.equal(saved.value.contentType, 'image/jpeg');
  assert.equal(result.storagePath, saved.path);
});

test('從私有資料庫讀取圖片', async () => {
  const imageStorage = createImageStorage({
    blobClient: {},
    database: {
      ref(path) {
        assert.equal(path, 'pharmacy_images/group/message-1');
        return {
          async once() {
            return {
              val() {
                return {
                  contentType: 'image/png',
                  data: Buffer.from('stored-image').toString('base64'),
                };
              },
            };
          },
        };
      },
    },
  });

  const result = await imageStorage.readImage(
    'pharmacy_images/group/message-1',
  );
  assert.equal(result.contentType, 'image/png');
  assert.equal(result.buffer.toString(), 'stored-image');
});
