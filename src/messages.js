const CATEGORY_LABELS = {
  handover: '交班',
  medication: '缺換藥',
  notice: '公告',
};

const HELP_MESSAGE = [
  '藥劑科資訊機器人指令：',
  '',
  '/h 內容　新增交班',
  '/m 內容　新增缺換藥',
  '/n 內容　新增公告',
  '/q　　　 查詢最新資訊',
  '/q h　　 查詢交班',
  '/q m　　 查詢缺換藥',
  '/q n　　 查詢公告',
  '/q 關鍵字　搜尋資訊',
  '/done 編號　完成事項',
  '/help　　 顯示說明',
  '',
  '一般群組聊天不會被保存。',
].join('\n');

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || '資訊';
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp));
}

function cleanText(text, maximumLength = 600) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximumLength) {
    return normalized;
  }
  return `${normalized.slice(0, maximumLength - 1)}…`;
}

function formatSavedRecord(record) {
  return [
    `[${record.shortId}] 已記錄${getCategoryLabel(record.category)}資訊`,
    cleanText(record.content),
    `登錄者：${cleanText(record.authorName, 80)}`,
  ].join('\n');
}

function formatCompletedRecord(record) {
  return `[${record.shortId}] 已標記為完成。`;
}

function formatQueryResult(records, filters = {}) {
  if (records.length === 0) {
    return '查無符合條件的資訊。';
  }

  const categoryText = filters.category
    ? getCategoryLabel(filters.category)
    : '重要';
  const keywordText = filters.keyword ? `｜關鍵字：${filters.keyword}` : '';
  const lines = [`${categoryText}資訊${keywordText}：`, ''];

  for (const record of records) {
    const block = [
      `[${record.shortId}] ${getCategoryLabel(record.category)}｜${formatTimestamp(record.createdAt)}｜${cleanText(record.authorName, 40)}`,
      cleanText(record.content),
      '',
    ];

    if ([...lines, ...block].join('\n').length > 4800) {
      lines.push('其餘結果已省略，請加入更精確的關鍵字。');
      break;
    }

    lines.push(...block);
  }

  return lines.join('\n').trim();
}

function formatInvalidCommand(command) {
  if (command.type === 'add' && !command.content) {
    const letter = {
      handover: 'h',
      medication: 'm',
      notice: 'n',
    }[command.category];
    return `請在指令後輸入內容，例如：/${letter} 需要記錄的資訊`;
  }

  if (command.type === 'complete' && !command.shortId) {
    return '請輸入事項編號，例如：/done M-ABC123';
  }

  return '無法辨識指令。輸入 /help 查看使用方式。';
}

module.exports = {
  HELP_MESSAGE,
  formatCompletedRecord,
  formatInvalidCommand,
  formatQueryResult,
  formatSavedRecord,
  getCategoryLabel,
};
