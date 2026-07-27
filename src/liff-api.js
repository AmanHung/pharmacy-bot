const express = require('express');
const { LiffAccessError } = require('./liff-auth');

const LIFF_RECORD_LIMIT = 100;
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function serializeRecord(record, currentTime = Date.now()) {
  return {
    shortId: record.shortId,
    category: record.category,
    content: record.content,
    authorName:
      record.category === 'handover' ? record.authorName || null : null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt || null,
    hasImage: Boolean(
      record.sourceImagePath &&
        record.sourceImageExpiresAt &&
        record.sourceImageExpiresAt > currentTime,
    ),
    sourceUrl: record.sourceUrl || null,
  };
}

function serializeHistoryRecord(record, currentTime = Date.now()) {
  return {
    ...serializeRecord(record, currentTime),
    status: 'completed',
    completedAt: record.completedAt,
    completedByName: record.completedByName || '群組成員',
  };
}

function createLiffRouter({
  authorize,
  repository,
  imageStorage,
  groupId,
}) {
  const router = express.Router();
  const scope = { type: 'group', id: groupId };

  router.use(async (request, response, next) => {
    try {
      request.liffMember = await authorize(request);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/records', async (request, response, next) => {
    try {
      const currentTime = Date.now();
      if (typeof repository.removeExpiredEducationRecords === 'function') {
        await repository.removeExpiredEducationRecords(scope, currentTime);
      }
      const records = await repository.listRecords(scope, {
        activeAt: currentTime,
        limit: LIFF_RECORD_LIMIT,
      });
      response.set('cache-control', 'private, no-store, max-age=0');
      response.json({
        displayName: request.liffMember.displayName || '群組成員',
        records: records.map((record) => serializeRecord(record, currentTime)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/history', async (request, response, next) => {
    try {
      const currentTime = Date.now();
      const cutoff = currentTime - HISTORY_RETENTION_MS;
      if (typeof repository.removeCompletedRecordsBefore === 'function') {
        await repository.removeCompletedRecordsBefore(scope, cutoff);
      }
      const records = await repository.listCompletedRecords(scope, {
        completedSince: cutoff,
        limit: LIFF_RECORD_LIMIT,
      });
      response.set('cache-control', 'private, no-store, max-age=0');
      response.json({
        records: records.map((record) =>
          serializeHistoryRecord(record, currentTime),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/records/:shortId/complete', async (request, response, next) => {
    try {
      const completedAt = Date.now();
      const record = await repository.completeRecord(
        scope,
        request.params.shortId,
        {
          completedAt,
          completedByUserId: request.liffMember.userId,
          completedByName: request.liffMember.displayName || '群組成員',
        },
      );
      if (!record) {
        response.status(404).json({ error: '找不到這筆資訊。' });
        return;
      }
      response.set('cache-control', 'private, no-store, max-age=0');
      response.json({
        ok: true,
        record: serializeHistoryRecord(record, completedAt),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/records/:shortId/restore', async (request, response, next) => {
    try {
      const restoredAt = Date.now();
      const record = await repository.restoreRecord(
        scope,
        request.params.shortId,
        {
          restoredAt,
          restoredByUserId: request.liffMember.userId,
          restoredByName: request.liffMember.displayName || '群組成員',
        },
      );
      if (!record) {
        response.status(404).json({ error: '找不到可恢復的資訊。' });
        return;
      }
      response.set('cache-control', 'private, no-store, max-age=0');
      response.json({
        ok: true,
        record: serializeRecord(record, restoredAt),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/images/:shortId', async (request, response, next) => {
    try {
      if (!imageStorage) {
        response.status(503).json({ error: '圖片儲存尚未完成設定。' });
        return;
      }
      const record = await repository.getRecordByShortId(
        scope,
        request.params.shortId,
      );
      if (!record?.sourceImagePath) {
        response.status(404).json({ error: '找不到原始圖片。' });
        return;
      }
      const image = await imageStorage.readImage(record.sourceImagePath);
      if (!image) {
        response.status(404).json({ error: '原始圖片已不存在。' });
        return;
      }

      response.set({
        'cache-control': 'private, no-store, max-age=0',
        'content-type': image.contentType,
        'content-length': String(image.buffer.length),
        'x-content-type-options': 'nosniff',
      });
      response.send(image.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _request, response, _next) => {
    if (error instanceof LiffAccessError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('LIFF request failed:', error);
    response.status(500).json({ error: '系統暫時無法處理，請稍後再試。' });
  });

  return router;
}

module.exports = {
  createLiffRouter,
  serializeHistoryRecord,
  serializeRecord,
  HISTORY_RETENTION_MS,
};
