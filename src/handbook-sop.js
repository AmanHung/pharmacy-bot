const crypto = require('node:crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const MAX_DRIVE_UPLOAD_BYTES = 5 * 1024 * 1024;

function createSopId(groupId, shortId) {
  const digest = crypto
    .createHash('sha256')
    .update(`${groupId}:${shortId}`)
    .digest('hex')
    .slice(0, 24);
  return `line-notice-${digest}`;
}

function createSopTitle(content) {
  const normalized = String(content || '').replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return 'LINE 公告';
  }
  return normalized.length > 60
    ? `${normalized.slice(0, 59)}…`
    : normalized;
}

async function uploadImageToDrive({
  gasApiUrl,
  image,
  shortId,
  fetchImpl,
}) {
  if (!image) {
    return '';
  }
  if (image.buffer.length > MAX_DRIVE_UPLOAD_BYTES) {
    throw new Error('公告圖片超過 5 MB，請縮小圖片後再轉為 SOP。');
  }

  const mimeType = image.contentType || 'image/jpeg';
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const response = await fetchImpl(gasApiUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({
      action: 'upload_to_drive',
      fileName: `LINE公告-${shortId}.${extension}`,
      mimeType,
      base64: `data:${mimeType};base64,${image.buffer.toString('base64')}`,
    }),
  });

  if (!response.ok) {
    throw new Error('公告圖片上傳失敗，請稍後再試。');
  }

  const result = await response.json();
  if (result.status !== 'success' || !result.url) {
    throw new Error(result.message || '公告圖片上傳失敗。');
  }
  return result.url;
}

function createHandbookSopPublisher({
  firestore,
  gasApiUrl,
  fetchImpl = fetch,
}) {
  if (!firestore || !gasApiUrl) {
    return null;
  }

  return {
    async publishNotice({ groupId, record, actorName, image = null }) {
      if (record.category !== 'notice') {
        throw new Error('只有公告可以轉為 SOP。');
      }

      const sopId = createSopId(groupId, record.shortId);
      const sopRef = firestore.collection('sop_articles').doc(sopId);
      const existing = await sopRef.get();
      if (existing.exists) {
        return { id: sopId, alreadyExists: true };
      }

      const attachmentUrl = await uploadImageToDrive({
        gasApiUrl,
        image,
        shortId: record.shortId,
        fetchImpl,
      });
      const editorName = `LINE：${actorName || '群組成員'}`;
      const sourceLink = record.sourceUrl
        ? `\n\n[開啟原始連結](${record.sourceUrl})`
        : '';

      try {
        await sopRef.create({
          title: createSopTitle(record.content),
          category: '行政流程',
          content: `${record.content || ''}${sourceLink}`.trim(),
          attachmentUrl,
          keywords: ['LINE', '公告'],
          description: '由 LINE 資訊中心公告轉入',
          sourceSystem: 'pharmacy-bot',
          sourceRecordId: record.shortId,
          sourceCreatedAt: record.createdAt
            ? Timestamp.fromMillis(record.createdAt)
            : null,
          updatedBy: editorName,
          updatedByName: editorName,
          updatedByUid: 'line-import',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        if (error?.code === 6 || error?.code === 'already-exists') {
          return { id: sopId, alreadyExists: true };
        }
        throw error;
      }

      return { id: sopId, alreadyExists: false, attachmentUrl };
    },
  };
}

module.exports = {
  createHandbookSopPublisher,
  createSopId,
  createSopTitle,
  uploadImageToDrive,
  MAX_DRIVE_UPLOAD_BYTES,
};
