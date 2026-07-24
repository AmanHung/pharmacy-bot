const NOTICE_DEADLINE_MARKER = '#到期';
const NOTICE_DEADLINE_PATTERN = /(?:^|\s)#到期\s+(\d{4})-(\d{2})-(\d{2})\s*$/u;

function taipeiEndOfDay(year, month, day) {
  return Date.UTC(year, month - 1, day, 15, 59, 59, 999);
}

function extractNoticeDeadline(content) {
  const text = String(content || '').trim();
  const match = text.match(NOTICE_DEADLINE_PATTERN);

  if (!match) {
    return text.includes(NOTICE_DEADLINE_MARKER)
      ? { error: 'invalid-notice-deadline' }
      : { content: text, expiresAt: null };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const checkDate = new Date(Date.UTC(year, month - 1, day));

  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return { error: 'invalid-notice-deadline' };
  }

  return {
    content: text.slice(0, match.index).trim(),
    expiresAt: taipeiEndOfDay(year, month, day),
  };
}

module.exports = { extractNoticeDeadline };
