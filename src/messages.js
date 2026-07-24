const { buildQueryPostback } = require('./postbacks');

const CATEGORY_LABELS = {
  handover: '交班',
  medication: '缺換藥',
  notice: '公告',
  education: '教育訓練',
};

const QUERY_PAGE_SIZE = 5;
const STALE_OPEN_DAYS = 7;

const JOIN_MESSAGE = [
  '大家好，我是藥劑科資訊小幫手。',
  '可協助整理及查詢交班、缺換藥、公告與教育訓練資訊。',
  '＠我或輸入 /help，即可開啟功能選單。',
  '一般聊天不會被記錄，請安心使用。',
].join('\n');

const HELP_MESSAGE = [
  '藥劑科資訊機器人指令：',
  '',
  '/h 內容　新增交班',
  '/m 內容　新增缺換藥',
  '/n 內容　新增公告',
  '/n 內容 #到期 YYYY-MM-DD　新增有期限的公告',
  '/e 內容　新增教育訓練',
  '/q　　　 查詢所有資訊',
  '/q h　　 查詢最近 7 天交班',
  '/q m　　 查詢所有缺換藥',
  '/q n　　 查詢所有公告',
  '/q e　　 查詢所有教育訓練',
  '/q 關鍵字　搜尋所有資訊',
  '/open　　 查詢所有未完成事項',
  '/open 關鍵字　搜尋未完成事項',
  '/done 編號　將事項移出待辦清單',
  '/help　　 顯示說明',
  '',
  '查詢結果可直接點右側按鈕處理。',
  '新增或處理成功時不另行回覆，以減少群組訊息。',
  '一般群組聊天不會被保存。',
].join('\n');

function createPillAction(
  label,
  action,
  color = '#E8F0FE',
  textColor = '#1A5FB4',
) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    margin: 'sm',
    paddingStart: 'sm',
    paddingEnd: 'sm',
    paddingTop: 'xs',
    paddingBottom: 'xs',
    cornerRadius: 'md',
    backgroundColor: color,
    contents: [
      {
        type: 'text',
        text: label,
        size: 'xs',
        color: textColor,
        weight: 'bold',
        align: 'center',
      },
    ],
    action,
  };
}

function createMenuRow(label, actionLabel, action) {
  return {
    type: 'box',
    layout: 'horizontal',
    alignItems: 'center',
    margin: 'sm',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#222222',
        flex: 1,
        wrap: true,
      },
      createPillAction(actionLabel, action),
    ],
  };
}

function createComposeAction(command, label) {
  return {
    type: 'postback',
    label,
    data: new URLSearchParams({
      action: 'compose',
      command,
    }).toString(),
    inputOption: 'openKeyboard',
    fillInText: `${command} `,
  };
}

const FUNCTION_MENU_MESSAGE = {
  type: 'flex',
  altText: '藥劑科資訊機器人功能選單',
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '藥劑科資訊機器人',
          weight: 'bold',
          size: 'md',
        },
        {
          type: 'text',
          text: '手機可點選輸入；桌面版請照指令輸入',
          size: 'xs',
          color: '#777777',
          margin: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: '新增資訊',
          size: 'xs',
          color: '#777777',
          weight: 'bold',
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            createMenuRow(
              '交班資訊',
              '輸入 /h',
              createComposeAction('/h', '輸入交班'),
            ),
            createMenuRow(
              '缺換藥資訊',
              '輸入 /m',
              createComposeAction('/m', '輸入缺換藥'),
            ),
            createMenuRow(
              '公告資訊',
              '輸入 /n',
              createComposeAction('/n', '輸入公告'),
            ),
            createMenuRow(
              '教育訓練',
              '輸入 /e',
              createComposeAction('/e', '輸入教育訓練'),
            ),
          ],
        },
        {
          type: 'separator',
          margin: 'md',
        },
        {
          type: 'text',
          text: '查詢資訊',
          size: 'xs',
          color: '#777777',
          weight: 'bold',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            createMenuRow('最近 7 天交班', '查詢', {
              type: 'postback',
              label: '查詢最近 7 天交班',
              data: buildQueryPostback({
                mode: 'query',
                category: 'handover',
              }),
            }),
            createMenuRow('所有缺換藥', '查詢', {
              type: 'postback',
              label: '查詢所有缺換藥',
              data: buildQueryPostback({
                mode: 'query',
                category: 'medication',
              }),
            }),
            createMenuRow('所有公告', '查詢', {
              type: 'postback',
              label: '查詢所有公告',
              data: buildQueryPostback({
                mode: 'query',
                category: 'notice',
              }),
            }),
            createMenuRow('所有教育訓練', '查詢', {
              type: 'postback',
              label: '查詢所有教育訓練',
              data: buildQueryPostback({
                mode: 'query',
                category: 'education',
              }),
            }),
            createMenuRow('所有未完成事項', '查詢', {
              type: 'postback',
              label: '查詢所有未完成事項',
              data: buildQueryPostback({ mode: 'open-query' }),
            }),
          ],
        },
        {
          type: 'text',
          text: '也可直接輸入 /help 或 /說明再次開啟本選單。',
          size: 'xs',
          color: '#777777',
          margin: 'lg',
          wrap: true,
        },
      ],
    },
  },
};

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

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function formatAge(createdAt, currentTime) {
  const difference = Math.max(0, currentTime - createdAt);
  const days = Math.floor(difference / (24 * 60 * 60 * 1000));

  if (days === 0) {
    return '今天建立';
  }

  return `${days >= STALE_OPEN_DAYS ? '可能過期｜' : ''}已 ${days} 天`;
}

function cleanText(text, maximumLength = 600) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximumLength) {
    return normalized;
  }
  return `${normalized.slice(0, maximumLength - 1)}…`;
}

function extractFirstWebUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/iu);
  if (!match) {
    return null;
  }

  const candidate = match[0].replace(/[，。！？；：,.!?;:）)\]}]+$/u, '');
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formatSavedRecord(record) {
  const lines = [
    `[${record.shortId}] 已記錄${getCategoryLabel(record.category)}資訊`,
    cleanText(record.content),
  ];

  if (record.category === 'handover') {
    lines.push(`登錄者：${cleanText(record.authorName, 80)}`);
  }

  if (record.category === 'notice' && record.expiresAt) {
    lines.push(`期限：${formatDate(record.expiresAt)}`);
  }

  return lines.join('\n');
}

function formatCompletedRecord(record) {
  if (record.alreadyCompleted) {
    return `[${record.shortId}] 這筆事項已經完成。`;
  }
  return `[${record.shortId}] 已標記為完成。`;
}

function createRecordComponents(record, filters, currentTime) {
  const actionLabel =
    record.category === 'handover' ? '已處理' : '刪除';
  const actionBackground =
    record.category === 'handover' ? '#E8F5E9' : '#FDECEC';
  const actionTextColor =
    record.category === 'handover' ? '#2E7D32' : '#C62828';
  const linkUrl =
    record.category === 'notice'
      ? extractFirstWebUrl(record.content)
      : null;
  const metadata = [
    getCategoryLabel(record.category),
    formatTimestamp(record.createdAt),
  ];

  if (record.category === 'handover') {
    metadata.push(cleanText(record.authorName, 40));
  }

  if (filters.type === 'open-query') {
    metadata.push(formatAge(record.createdAt, currentTime));
  }

  if (record.category === 'notice' && record.expiresAt) {
    metadata.push(`期限 ${formatDate(record.expiresAt)}`);
  }

  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: metadata.join('｜'),
        size: 'xs',
        color: '#666666',
        wrap: true,
      },
      {
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        contents: [
          {
            type: 'text',
            text: cleanText(record.content, 300),
            size: 'sm',
            color: '#222222',
            wrap: true,
            flex: 1,
          },
          ...(linkUrl
            ? [
                createPillAction('開啟連結', {
                  type: 'uri',
                  label: '開啟公告連結',
                  uri: linkUrl,
                  altUri: {
                    desktop: linkUrl,
                  },
                }),
              ]
            : []),
          createPillAction(
            actionLabel,
            {
              type: 'message',
              label: actionLabel,
              text: `/done ${record.shortId}`,
            },
            actionBackground,
            actionTextColor,
          ),
        ],
      },
    ],
  };
}

function createPaginationFooter(filters, page, pageCount) {
  if (pageCount <= 1) {
    return undefined;
  }

  const contents = [];
  if (page > 0) {
    contents.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'postback',
        label: '上一頁',
        data: buildQueryPostback({ ...filters, page: page - 1 }),
      },
    });
  }
  if (page < pageCount - 1) {
    contents.push({
      type: 'button',
      style: 'primary',
      height: 'sm',
      action: {
        type: 'postback',
        label: '下一頁',
        data: buildQueryPostback({ ...filters, page: page + 1 }),
      },
    });
  }

  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents,
  };
}

function formatQueryResult(
  records,
  filters = {},
  { currentTime = Date.now(), page = 0 } = {},
) {
  if (records.length === 0) {
    return '查無符合條件的資訊。';
  }

  const categoryText = filters.category
    ? getCategoryLabel(filters.category)
    : '重要';
  const keywordText = filters.keyword ? `｜${filters.keyword}` : '';
  const rangeText =
    filters.type === 'open-query'
      ? '未完成'
      : filters.category === 'handover'
        ? '最近 7 天'
        : '';
  const title = `${categoryText}${rangeText}資訊${keywordText}`;
  const pageCount = Math.max(1, Math.ceil(records.length / QUERY_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const pageRecords = records.slice(
    safePage * QUERY_PAGE_SIZE,
    (safePage + 1) * QUERY_PAGE_SIZE,
  );
  const bodyContents = [];

  for (const [index, record] of pageRecords.entries()) {
    if (index > 0) {
      bodyContents.push({
        type: 'separator',
        margin: 'md',
      });
    }
    bodyContents.push(createRecordComponents(record, filters, currentTime));
  }

  const footer = createPaginationFooter(filters, safePage, pageCount);

  return {
    type: 'flex',
    altText: `${title}（第 ${safePage + 1}/${pageCount} 頁）`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: `共 ${records.length} 筆｜第 ${safePage + 1}/${pageCount} 頁`,
            size: 'xs',
            color: '#777777',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents,
      },
      ...(footer ? { footer } : {}),
    },
  };
}

function formatInvalidCommand(command) {
  if (command.reason === 'invalid-notice-deadline') {
    return '公告期限格式錯誤，例如：/n 盤點提醒 #到期 2026-07-31';
  }

  if (command.type === 'add' && !command.content) {
    const letter = {
      handover: 'h',
      medication: 'm',
      notice: 'n',
      education: 'e',
    }[command.category];
    return `請在指令後輸入內容，例如：/${letter} 需要記錄的資訊`;
  }

  if (command.type === 'complete' && !command.shortId) {
    return '請輸入事項編號，例如：/done M-ABC123';
  }

  return '無法辨識指令。輸入 /help 查看使用方式。';
}

module.exports = {
  FUNCTION_MENU_MESSAGE,
  HELP_MESSAGE,
  JOIN_MESSAGE,
  QUERY_PAGE_SIZE,
  formatAge,
  formatCompletedRecord,
  formatInvalidCommand,
  formatQueryResult,
  formatSavedRecord,
  getCategoryLabel,
};
