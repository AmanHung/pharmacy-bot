const { toFirebaseScopeKey } = require('./scope');

const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

async function readableToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createImageStorage({ database, blobClient, now = () => Date.now() }) {
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
      const createdAt = now();
      const expiresAt = createdAt + IMAGE_RETENTION_MS;

      await database.ref(storagePath).set({
        contentType: DEFAULT_IMAGE_CONTENT_TYPE,
        data: buffer.toString('base64'),
        size: buffer.length,
        createdAt,
        expiresAt,
      });

      return {
        storagePath,
        contentType: DEFAULT_IMAGE_CONTENT_TYPE,
        size: buffer.length,
        expiresAt,
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
      const expiresAt =
        stored.expiresAt ||
        (stored.createdAt ? stored.createdAt + IMAGE_RETENTION_MS : 0);
      if (!expiresAt || expiresAt <= now()) {
        await database.ref(storagePath).remove();
        return null;
      }
      return {
        buffer: Buffer.from(stored.data, 'base64'),
        contentType: stored.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
      };
    },

    async removeExpiredImages(currentTime = now()) {
      const root = database.ref('pharmacy_images');
      const snapshot = await root.once('value');
      const scopes = snapshot.val() || {};
      const updates = {};

      for (const [scopeKey, images] of Object.entries(scopes)) {
        for (const [messageId, stored] of Object.entries(images || {})) {
          const expiresAt =
            stored.expiresAt ||
            (stored.createdAt
              ? stored.createdAt + IMAGE_RETENTION_MS
              : 0);
          if (!expiresAt || expiresAt <= currentTime) {
            updates[`${scopeKey}/${messageId}`] = null;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await root.update(updates);
      }
      return Object.keys(updates).length;
    },
  };
}

module.exports = {
  createImageStorage,
  readableToBuffer,
  IMAGE_RETENTION_MS,
  MAX_IMAGE_BYTES,
};
