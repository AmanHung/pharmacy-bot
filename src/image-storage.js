const { toFirebaseScopeKey } = require('./scope');

const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

async function readableToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createImageStorage({ storage, blobClient }) {
  if (!storage || !blobClient) {
    return null;
  }

  const bucket = storage.bucket();

  return {
    async saveLineImage(scope, messageId) {
      const content = await blobClient.getMessageContent(messageId);
      const buffer = await readableToBuffer(content);
      const storagePath = [
        'pharmacy-images',
        toFirebaseScopeKey(scope),
        `${messageId}.jpg`,
      ].join('/');

      await bucket.file(storagePath).save(buffer, {
        resumable: false,
        metadata: {
          contentType: DEFAULT_IMAGE_CONTENT_TYPE,
          cacheControl: 'private, no-store, max-age=0',
        },
      });

      return {
        storagePath,
        contentType: DEFAULT_IMAGE_CONTENT_TYPE,
        size: buffer.length,
      };
    },

    async readImage(storagePath) {
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }

      const [metadata] = await file.getMetadata();
      const [buffer] = await file.download();
      return {
        buffer,
        contentType: metadata.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
      };
    },
  };
}

module.exports = { createImageStorage, readableToBuffer };
