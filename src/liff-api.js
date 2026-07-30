const express = require('express');
const { LiffAccessError } = require('./liff-auth');

const LIFF_RECORD_LIMIT = 100;
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function stripNoticeAudienceTags(text) {
  return String(text || '')
    .replace(/(^|\s)@all\b/giu, ' ')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

function serializeRecord(record, currentTime = Date.now()) {
  return {
    shortId: record.shortId,
    category: record.category,
    content:
      record.category === 'notice'
        ? stripNoticeAudienceTags(record.content)
        : record.content,
    authorName:
      record.category === 'handover' ? record.authorName || null : null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt || null,
    hasImage: Boolean(
      record.sourceImagePath,
    ),
    sourceUrl: record.sourceUrl || null,
    convertedToSopAt: record.convertedToSopAt || null,
    convertedToSopByName: record.convertedToSopByName || null,
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
  sopPublisher = null,
}) {
  const router = express.Router();

  function getScope(request) {
    return { type: 'group', id: request.liffMember.groupId };
  }

  async function deleteRecordImage(record) {
    if (record.sourceImagePath && imageStorage?.deleteImage) {
      await imageStorage.deleteImage(record.sourceImagePath);
    }
  }

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
      const scope = getScope(request);
      const currentTime = Date.now();
      if (typeof repository.removeExpiredEducationRecords === 'function') {
        await repository.removeExpiredEducationRecords(scope, currentTime, {
          onRemove: deleteRecordImage,
        });
      }
      const records = await repository.listRecords(scope, {
        activeAt: currentTime,
        limit: LIFF_RECORD_LIMIT,
      });
      response.set('cache-control', 'private, no-store, max-age=0');
      response.json({
        displayName: request.liffMember.displayName || '群組成員',
        sopConversionEnabled: Boolean(sopPublisher),
        records: records.map((record) => serializeRecord(record, currentTime)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/history', async (request, response, next) => {
    try {
      const scope = getScope(request);
      const currentTime = Date.now();
      const cutoff = currentTime - HISTORY_RETENTION_MS;
      if (typeof repository.removeCompletedRecordsBefore === 'function') {
        await repository.removeCompletedRecordsBefore(scope, cutoff, {
          onRemove: deleteRecordImage,
        });
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
      const scope = getScope(request);
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
      const scope = getScope(request);
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

  router.post(
    '/records/:shortId/convert-to-sop',
    async (request, response, next) => {
      try {
        if (!sopPublisher) {
          response.status(503).json({
            error: '轉 SOP 功能尚未完成後端設定。',
          });
          return;
        }

        const scope = getScope(request);
        const record = await repository.getRecordByShortId(
          scope,
          request.params.shortId,
        );
        if (!record) {
          response.status(404).json({ error: '找不到這筆公告。' });
          return;
        }
        if (record.category !== 'notice') {
          response.status(400).json({ error: '只有公告可以轉為 SOP。' });
          return;
        }
        if (record.handbookSopId) {
          response.json({
            ok: true,
            sopId: record.handbookSopId,
            alreadyExists: true,
            record: serializeRecord(record),
          });
          return;
        }

        let image = null;
        if (record.sourceImagePath) {
          image = await imageStorage?.readImage(record.sourceImagePath);
          if (!image) {
            response.status(409).json({
              error: '公告原圖已不存在，請重新附圖後再轉為 SOP。',
            });
            return;
          }
        }

        const result = await sopPublisher.publishNotice({
          groupId: request.liffMember.groupId,
          record,
          actorName: request.liffMember.displayName || '群組成員',
          image,
        });
        const convertedAt = Date.now();
        const updatedRecord = await repository.markRecordConvertedToSop(
          scope,
          record.shortId,
          {
            handbookSopId: result.id,
            convertedToSopAt: convertedAt,
            convertedToSopByUserId: request.liffMember.userId,
            convertedToSopByName:
              request.liffMember.displayName || '群組成員',
          },
        );

        response.set('cache-control', 'private, no-store, max-age=0');
        response.json({
          ok: true,
          sopId: result.id,
          alreadyExists: result.alreadyExists,
          record: serializeRecord(updatedRecord || record, convertedAt),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/images/:shortId', async (request, response, next) => {
    try {
      const scope = getScope(request);
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
