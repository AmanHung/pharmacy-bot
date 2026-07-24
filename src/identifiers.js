const CATEGORY_PREFIXES = {
  handover: 'H',
  medication: 'M',
  notice: 'N',
  education: 'E',
  safety: 'S',
};

function createShortId(category, eventKey, timestamp = Date.now()) {
  const prefix = CATEGORY_PREFIXES[category];
  const cleanEventKey = String(eventKey || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  const fallback = timestamp.toString(36).toUpperCase();
  const suffix = `${fallback}${cleanEventKey}`.slice(-6).padStart(6, '0');

  return `${prefix}-${suffix}`;
}

module.exports = { createShortId };
