const NOTICE_DEADLINE_MARKER = '#到期';
const NOTICE_DEADLINE_PATTERN = /(?:^|\s)#到期\s+(\d{4})-(\d{2})-(\d{2})\s*$/u;

const EDUCATION_DATE_PATTERN = /(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})(?:日)?/u;

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

function extractEducationDeadline(content, referenceTimestamp = Date.now()) {
  const text = String(content || '');
  if (!/(上課|課程)/u.test(text)) {
    return null;
  }

  const match = text.match(EDUCATION_DATE_PATTERN);
  if (!match) {
    return null;
  }

  const explicitYear = match[1] ? Number(match[1]) : null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const taipeiParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
  })
    .formatToParts(new Date(referenceTimestamp))
    .reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
  let year = explicitYear || Number(taipeiParts.year);
  let expiresAt = taipeiEndOfDay(year, month, day);
  const checkDate = new Date(Date.UTC(year, month - 1, day));

  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }

  if (!explicitYear && expiresAt < referenceTimestamp) {
    year += 1;
    expiresAt = taipeiEndOfDay(year, month, day);
  }

  return expiresAt;
}

module.exports = { extractEducationDeadline, extractNoticeDeadline };
