const { toFirebaseScopeKey } = require('./scope');

const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

async function readableToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createImageStorage({ database, blobClient }) {
  if (!database || !blobClient) {
    return null;
  }

  return {
    async saveLineImage(scope, messageId) {
      const content = await blobClient.getMessageContent(messageId);
      const buffer = await readableToBuffer(content);
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('LINE image exceeds the private storage size limit.');
      }
      const storagePath = [
        'pharmacy_images',
        toFirebaseScopeKey(scope),
        messageId,
      ].join('/');

      await database.ref(storagePath).set({
        contentType: DEFAULT_IMAGE_CONTENT_TYPE,
        data: buffer.toString('base64'),
        size: buffer.length,
        createdAt: Date.now(),
      });

      return {
        storagePath,
        contentType: DEFAULT_IMAGE_CONTENT_TYPE,
        size: buffer.length,
      };
    },

    async readImage(storagePath) {
      if (!String(storagePath).startsWith('pharmacy_images/')) {
        return null;
      }

      const snapshot = await database.ref(storagePath).once('value');
      const stored = snapshot.val();
      if (!stored?.data) {
        return null;
      }
      return {
        buffer: Buffer.from(stored.data, 'base64'),
        contentType: stored.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
      };
    },
  };
}

module.exports = { createImageStorage, readableToBuffer, MAX_IMAGE_BYTES };
