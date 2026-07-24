const CATEGORY_ALIASES = new Map([
  ['h', 'handover'],
  ['交', 'handover'],
  ['m', 'medication'],
  ['藥', 'medication'],
  ['缺', 'medication'],
  ['n', 'notice'],
  ['公', 'notice'],
  ['e', 'education'],
  ['教', 'education'],
]);

const COMMAND_ALIASES = new Map([
  ['h', 'add'],
  ['交', 'add'],
  ['m', 'add'],
  ['藥', 'add'],
  ['缺', 'add'],
  ['n', 'add'],
  ['公', 'add'],
  ['e', 'add'],
  ['教', 'add'],
  ['q', 'query'],
  ['查', 'query'],
  ['done', 'complete'],
  ['完成', 'complete'],
  ['help', 'help'],
  ['說明', 'help'],
]);

function normalizeCommandText(text) {
  return text.trim().replace(/^／/, '/');
}

function getCategory(value) {
  return CATEGORY_ALIASES.get(value.toLowerCase()) || null;
}

function parseCommand(text) {
  if (typeof text !== 'string') {
    return { type: 'ignore' };
  }

  const normalized = normalizeCommandText(text);
  if (!normalized.startsWith('/')) {
    return { type: 'ignore' };
  }

  const commandText = normalized.slice(1).trim();
  if (!commandText) {
    return { type: 'invalid', reason: 'empty-command' };
  }

  const parts = commandText.split(/\s+/);
  const rawCommand = parts.shift().toLowerCase();
  const command = COMMAND_ALIASES.get(rawCommand);

  if (!command) {
    return { type: 'invalid', reason: 'unknown-command' };
  }

  if (command === 'help') {
    return { type: 'help' };
  }

  if (command === 'add') {
    return {
      type: 'add',
      category: getCategory(rawCommand),
      content: parts.join(' ').trim(),
    };
  }

  if (command === 'complete') {
    return {
      type: 'complete',
      shortId: (parts[0] || '').toUpperCase(),
    };
  }

  const possibleCategory = parts[0] ? getCategory(parts[0]) : null;
  if (possibleCategory) {
    parts.shift();
  }

  return {
    type: command === 'open-query' ? 'open-query' : 'query',
    category: possibleCategory,
    keyword: parts.join(' ').trim(),
  };
}

module.exports = {
  getCategory,
  parseCommand,
};
