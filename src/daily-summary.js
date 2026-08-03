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

function formatDailySummary(records, currentTime, options = {}) {
  if (records.length === 0) {
    return '今日沒有未處理交班事項。';
  }

  return formatQueryResult(
    records,
    {
      type: 'open-query',
      category: 'handover',
    },
    { currentTime, dailySummary: true, ...options },
  );
}

function formatTodayEducationSummary(records, currentTime, options = {}) {
  if (records.length === 0) {
    return null;
  }

  return formatQueryResult(
    records,
    {
      type: 'query',
      category: 'education',
    },
    { currentTime, dailySummary: true, ...options },
  );
}

function buildDailyMessages(
  handoverRecords,
  educationRecords,
  currentTime,
  options = {},
) {
  const handoverMessage = formatDailySummary(
    handoverRecords,
    currentTime,
    options,
  );
  const messages = [
    typeof handoverMessage === 'string'
      ? { type: 'text', text: handoverMessage }
      : handoverMessage,
  ];
  const educationMessage = formatTodayEducationSummary(
    educationRecords,
    currentTime,
    options,
  );

  if (educationMessage) {
    messages.push(educationMessage);
  }

  return messages;
}

function createDailySummarySender({
  client,
  repository,
  groupId,
  liffId = null,
  now = () => Date.now(),
}) {
  return async function sendDailySummary() {
    if (!groupId) {
      return { status: 'disabled' };
    }

    const currentTime = now();
    const dateKey = getTaipeiDateKey(currentTime);
    const scope = { type: 'group', id: groupId };
    const handoverRecords = await repository.listRecords(scope, {
      category: 'handover',
      activeAt: currentTime,
      limit: DAILY_SUMMARY_LIMIT,
    });

    if (typeof repository.removeExpiredEducationRecords === 'function') {
      await repository.removeExpiredEducationRecords(scope, currentTime);
    }

    const educationRecords = (
      await repository.listRecords(scope, {
        category: 'education',
        activeAt: currentTime,
        limit: DAILY_SUMMARY_LIMIT,
      })
    ).filter(
      (record) =>
        record.expiresAt &&
        getTaipeiDateKey(record.expiresAt) === dateKey,
    );

    const retryKey = createRetryKey(groupId, dateKey);
    const messages = buildDailyMessages(
      handoverRecords,
      educationRecords,
      currentTime,
      { liffId, groupId },
    );

    await client.pushMessage(
      {
        to: groupId,
        messages,
      },
      retryKey,
    );

    return {
      status: 'sent',
      date: dateKey,
      recordCount: handoverRecords.length,
      educationCount: educationRecords.length,
    };
  };
}

module.exports = {
  buildDailyMessages,
  createDailySummarySender,
  createRetryKey,
  formatDailySummary,
  getTaipeiDateKey,
};
