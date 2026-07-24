function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function parseDrugAliases(rawValue = '') {
  if (!rawValue || !rawValue.trim()) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error('DRUG_ALIASES_JSON must be valid JSON.');
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('DRUG_ALIASES_JSON must be a JSON object.');
  }

  return Object.entries(parsed).map(([canonicalName, aliases]) => {
    if (!Array.isArray(aliases)) {
      throw new Error('Each DRUG_ALIASES_JSON value must be an array.');
    }
    return [canonicalName, ...aliases]
      .map(normalizeSearchText)
      .filter(Boolean);
  });
}

function createSearchTerms(keyword, drugAliases = []) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) {
    return [];
  }

  const matchingGroup = drugAliases.find((group) =>
    group.includes(normalizedKeyword),
  );
  return matchingGroup || [normalizedKeyword];
}

module.exports = {
  createSearchTerms,
  normalizeSearchText,
  parseDrugAliases,
};
