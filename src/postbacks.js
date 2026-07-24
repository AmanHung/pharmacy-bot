const VALID_CATEGORIES = new Set([
  'handover',
  'medication',
  'notice',
  'education',
]);
const MAX_POSTBACK_KEYWORD_LENGTH = 120;

function buildCompletePostback(shortId) {
  return new URLSearchParams({
    action: 'complete',
    id: shortId,
  }).toString();
}

function buildViewSourcePostback(shortId) {
  return new URLSearchParams({
    action: 'view-source',
    id: shortId,
  }).toString();
}

function buildQueryPostback({
  mode = 'query',
  type,
  category = null,
  keyword = '',
  page = 0,
}) {
  const queryMode = type || mode;
  let safeKeyword = String(keyword).slice(0, MAX_POSTBACK_KEYWORD_LENGTH);

  while (true) {
    const data = new URLSearchParams({
      action: 'query',
      mode: queryMode === 'open-query' ? 'open' : 'query',
      category: category || '',
      keyword: safeKeyword,
      page: String(Math.max(0, page)),
    }).toString();

    if (data.length <= 300 || safeKeyword.length === 0) {
      return data;
    }

    safeKeyword = safeKeyword.slice(0, -1);
  }
}

function parsePostback(data) {
  if (typeof data !== 'string') {
    return null;
  }

  const parameters = new URLSearchParams(data);
  const action = parameters.get('action');

  if (action === 'complete') {
    const shortId = (parameters.get('id') || '').trim().toUpperCase();
    return shortId ? { type: 'complete', shortId } : null;
  }

  if (action === 'view-source') {
    const shortId = (parameters.get('id') || '').trim().toUpperCase();
    return shortId ? { type: 'view-source', shortId } : null;
  }

  if (action !== 'query') {
    return null;
  }

  const rawCategory = parameters.get('category');
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : null;
  const page = Number.parseInt(parameters.get('page') || '0', 10);

  return {
    type: parameters.get('mode') === 'open' ? 'open-query' : 'query',
    category,
    keyword: (parameters.get('keyword') || '').trim(),
    page: Number.isSafeInteger(page) && page >= 0 ? page : 0,
  };
}

module.exports = {
  buildCompletePostback,
  buildQueryPostback,
  buildViewSourcePostback,
  parsePostback,
};
