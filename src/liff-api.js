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

function serializeRecord(
  record,
  currentTime = Date.now(),
  { imageCount = null } = {},
) {
  const resolvedImageCount =
    imageCount === null
      ? Number(record.sourceImageCount) ||
        (record.sourceImagePath ? 1 : 0)
      : imageCount;
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
    hasImage: resolvedImageCount > 0,
    imageCount: resolvedImageCount,
    sourceUrl: record.sourceUrl || null,
    convertedToSopAt: record.convertedToSopAt || null,
    convertedToSopByName: record.convertedToSopByName || null,
  };
}

function serializeHistoryRecord(
  record,
  currentTime = Date.now(),
  options = {},
) {
  return {
    ...serializeRecord(record, currentTime, options),
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

  async function getRecordImagePaths(scope, record) {
    const paths = [];
    if (
      record.sourceImageSetId &&
      typeof repository.getImageSetReferences === 'function'
    ) {
      const references = await repository.getImageSetReferences(
        scope,
        record.sourceImageSetId,
      );
      for (const reference of references) {
        if (reference.storagePath) {
          paths.push(reference.storagePath);
        }
      }
    }
    if (paths.length === 0 && record.sourceImagePath) {
      paths.push(record.sourceImagePath);
    }
    return [...new Set(paths)];
  }

  async function serializeRecordWithImages(scope, record, currentTime) {
    const imagePaths = await getRecordImagePaths(scope, record);
    const imageCount = Math.max(
      imagePaths.length,
      Number(record.sourceImageCount) || 0,
    );
    return serializeRecord(record, currentTime, { imageCount });
  }

  async function deleteRecordImage(scope, record) {
    if (!imageStorage?.deleteImage) {
      return;
    }
    const paths = await getRecordImagePaths(scope, record);
    await Promise.all(paths.map((path) => imageStorage.deleteImage(path)));
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
          onRemove: (record) => deleteRecordImage(scope, record),
        });
      }
      const records = await repository.listRecords(scope, {
        activeAt: currentTime,
        limit: LIFF_RECORD_LIMIT,
      });
      response.set('cache-control', 'private, no-store, max-age=0');
      const serializedRecords = await Promise.all(
        records.map((record) =>
          serializeRecordWithImages(scope, record, currentTime),
        ),
      );
      response.json({
        displayName: request.liffMember.displayName || '群組成員',
        sopConversionEnabled: Boolean(sopPublisher),
        records: serializedRecords,
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
          onRemove: (record) => deleteRecordImage(scope, record),
        });
      }
      const records = await repository.listCompletedRecords(scope, {
        completedSince: cutoff,
        limit: LIFF_RECORD_LIMIT,
      });
      response.set('cache-control', 'private, no-store, max-age=0');
      const serializedRecords = await Promise.all(
        records.map(async (record) => {
          const serialized = await serializeRecordWithImages(
            scope,
            record,
            currentTime,
          );
          return {
            ...serialized,
            status: 'completed',
            completedAt: record.completedAt,
            completedByName: record.completedByName || '群組成員',
          };
        }),
      );
      response.json({ records: serializedRecords });
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

        const images = [];
        const imagePaths = await getRecordImagePaths(scope, record);
        for (const imagePath of imagePaths) {
          const image = await imageStorage?.readImage(imagePath);
          if (!image) {
            response.status(409).json({
              error: '公告原圖已不存在，請重新附圖後再轉為 SOP。',
            });
            return;
          }
          images.push(image);
        }

        const result = await sopPublisher.publishNotice({
          groupId: request.liffMember.groupId,
          record,
          actorName: request.liffMember.displayName || '群組成員',
          images,
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

  async function serveRecordImage(request, response, next) {
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
      if (!record) {
        response.status(404).json({ error: '找不到原始圖片。' });
        return;
      }
      const imagePaths = await getRecordImagePaths(scope, record);
      const imageIndex = Number.parseInt(request.params.index || '0', 10);
      if (
        !Number.isInteger(imageIndex) ||
        imageIndex < 0 ||
        imageIndex >= imagePaths.length
      ) {
        response.status(404).json({ error: '找不到原始圖片。' });
        return;
      }
      const image = await imageStorage.readImage(imagePaths[imageIndex]);
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
  }

  router.get('/images/:shortId', serveRecordImage);
  router.get('/images/:shortId/:index', serveRecordImage);

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
