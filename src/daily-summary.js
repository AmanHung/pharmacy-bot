const crypto = require('node:crypto');
const { formatQueryResult } = require('./messages');

const DAILY_SUMMARY_LIMIT = 100;

function getTaipeiDateKey(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function createRetryKey(groupId, dateKey) {
  const bytes = crypto
    .createHash('sha256')
    .update(`daily-handover-summary:${groupId}:${dateKey}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function formatDailySummary(records, currentTime) {
  if (records.length === 0) {
    return '【每日未處理交班摘要】\n目前沒有未處理交班事項。';
  }

  return formatQueryResult(
    records,
    {
      type: 'open-query',
      category: 'handover',
    },
    { currentTime },
  );
}

function createDailySummarySender({
  client,
  repository,
  groupId,
  now = () => Date.now(),
}) {
  return async function sendDailySummary() {
    if (!groupId) {
      return { status: 'disabled' };
    }

    const currentTime = now();
    const records = await repository.listRecords(
      { type: 'group', id: groupId },
      {
        category: 'handover',
        activeAt: currentTime,
        limit: DAILY_SUMMARY_LIMIT,
      },
    );
    const message = formatDailySummary(records, currentTime);
    const dateKey = getTaipeiDateKey(currentTime);
    const retryKey = createRetryKey(groupId, dateKey);

    await client.pushMessage(
      {
        to: groupId,
        messages: [
          typeof message === 'string'
            ? { type: 'text', text: message }
            : message,
        ],
      },
      retryKey,
    );

    return {
      status: 'sent',
      date: dateKey,
      recordCount: records.length,
    };
  };
}

module.exports = {
  createDailySummarySender,
  createRetryKey,
  formatDailySummary,
  getTaipeiDateKey,
};
