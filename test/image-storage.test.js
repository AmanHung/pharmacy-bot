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
    storage: {
      bucket() {
        return {
          file(path) {
            return {
              async save(buffer, options) {
                saved = { path, buffer, options };
              },
            };
          },
        };
      },
    },
  });

  const result = await imageStorage.saveLineImage(
    { type: 'group', id: 'G1' },
    'message-1',
  );

  assert.match(saved.path, /^pharmacy-images\//);
  assert.match(saved.path, /message-1\.jpg$/);
  assert.equal(saved.buffer.toString(), 'image-data');
  assert.equal(saved.options.metadata.cacheControl, 'private, no-store, max-age=0');
  assert.equal(result.storagePath, saved.path);
});
