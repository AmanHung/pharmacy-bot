const {
  buildCompletePostback,
  buildQueryPostback,
  buildViewSourcePostback,
} = require('./postbacks');

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
  '輸入 /help，即可開啟功能選單。',
  '一般聊天不會被記錄，請安心使用。',
].join('\n');

function createLiffUrl(liffId, groupId = null) {
  const url = `https://liff.line.me/${encodeURIComponent(liffId)}`;
  return groupId
    ? `${url}?groupId=${encodeURIComponent(groupId)}`
    : url;
}

function createJoinMessage(liffId, groupId = null) {
  const bodyContents = [
    {
      type: 'text',
      text: '自動整理群組重要資訊',
      weight: 'bold',
      size: 'lg',
      color: '#0B5D3B',
    },
    {
      type: 'text',
      text: '一般聊天不記錄；記錄成功不回覆，減少洗版。',
      size: 'sm',
      color: '#666666',
      wrap: true,
      margin: 'sm',
    },
    {
      type: 'separator',
      margin: 'lg',
    },
    {
      type: 'text',
      text: '自動記錄關鍵字',
      weight: 'bold',
      size: 'sm',
      margin: 'lg',
    },
    {
      type: 'text',
      text: [
        '交班　→ 交班',
        '標註個別同仁　→ 交班',
        '缺藥・換藥・鎖檔・開檔　→ 缺換藥',
        '公告・@All　→ 公告',
        '上課・課程　→ 教育訓練',
      ].join('\n'),
      size: 'sm',
      color: '#333333',
      wrap: true,
      margin: 'sm',
    },
    {
      type: 'text',
      text: '也可用 /h、/m、/n、/e 明確指定分類。',
      size: 'xs',
      color: '#777777',
      wrap: true,
      margin: 'sm',
    },
    {
      type: 'separator',
      margin: 'lg',
    },
    {
      type: 'text',
      text: '圖片與處理',
      weight: 'bold',
      size: 'sm',
      margin: 'lg',
    },
    {
      type: 'text',
      text: '圖片需使用「回覆」，並輸入分類關鍵字（交班、缺藥／換藥、公告或上課）。',
      size: 'xs',
      color: '#666666',
      wrap: true,
      margin: 'sm',
    },
    {
      type: 'text',
      text: '每日 08:00～09:00 間推播未處理交班及當天課程。',
      size: 'xs',
      color: '#0B5D3B',
      weight: 'bold',
      wrap: true,
      margin: 'lg',
    },
  ];

  const footerContents = [];
  if (liffId) {
    footerContents.push({
      type: 'button',
      style: 'primary',
      height: 'sm',
      color: '#0B7A4B',
      action: {
        type: 'uri',
        label: '開啟本群組資訊中心',
        uri: createLiffUrl(liffId, groupId),
      },
    });
    footerContents.push({
      type: 'text',
      text: '只限目前仍在本群組的成員查看',
      size: 'xxs',
      color: '#888888',
      align: 'center',
      wrap: true,
      margin: 'sm',
    });
  }

  return {
    type: 'flex',
    altText: '藥劑科資訊小幫手｜功能說明與資訊中心',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0B5D3B',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: '藥劑科資訊小幫手',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'xl',
          },
          {
            type: 'text',
            text: '功能說明｜本群組專屬入口',
            color: '#D7F2E4',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        contents: bodyContents,
      },
      ...(footerContents.length > 0
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              paddingAll: 'lg',
              contents: footerContents,
            },
          }
        : {}),
    },
  };
}

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
  '/done 編號　將事項移出待辦清單',
  '/help　　 顯示說明',
  '',
  '查詢結果可直接點右側按鈕處理。',
  '圖片公告：對圖片使用「回覆」，再輸入 /n 公告內容。',
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
          text: '新增可點選輸入；查詢請使用私人資訊中心',
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
          type: 'text',
          text: [
            '圖片公告：對圖片使用「回覆」，再輸入 /n 公告內容。',
            '查詢資訊請開啟私人資訊中心。',
          ].join('\n'),
          size: 'xs',
          color: '#777777',
          margin: 'lg',
          wrap: true,
        },
      ],
    },
  },
};

function createFunctionMenuMessage(liffId, groupId = null) {
  if (!liffId) {
    return FUNCTION_MENU_MESSAGE;
  }

  const message = JSON.parse(JSON.stringify(FUNCTION_MENU_MESSAGE));
  message.contents.body.contents.unshift(
    createMenuRow('私人資訊中心', '開啟', {
      type: 'uri',
      label: '開啟私人資訊中心',
      uri: createLiffUrl(liffId, groupId),
    }),
    {
      type: 'separator',
      margin: 'md',
    },
  );
  return message;
}

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

function isLineNoteUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'line.me' && /\/note\//u.test(parsed.pathname);
  } catch {
    return false;
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
  const completedByName = cleanText(record.completedByName || '同仁', 80);

  if (record.alreadyCompleted) {
    return `這筆事項已由 ${completedByName} 處理：${cleanText(record.content, 500)}`;
  }

  const actionLabel =
    record.category === 'handover' ? '已處理' : '已刪除';
  return `${completedByName}${actionLabel}：${cleanText(record.content, 500)}`;
}

function createRecordComponents(
  record,
  filters,
  currentTime,
  { dailySummary = false, liffId = null, groupId = null } = {},
) {
  const actionLabel =
    record.category === 'handover' ? '已處理' : '刪除';
  const actionBackground =
    record.category === 'handover' ? '#E8F5E9' : '#FDECEC';
  const actionTextColor =
    record.category === 'handover' ? '#2E7D32' : '#C62828';
  const sourceUrl = record.sourceUrl || null;
  const contentUrl = extractFirstWebUrl(record.content);
  const linkUrl = sourceUrl || contentUrl;
  const isNoteLink = Boolean(sourceUrl) || isLineNoteUrl(contentUrl);
  const linkLabel = isNoteLink ? '開啟記事本' : '開啟連結';
  const linkActionLabel = isNoteLink ? '開啟原始記事本' : '開啟連結';
  const hasSource = Boolean(
    linkUrl || record.sourceQuoteToken || record.sourceImagePath,
  );
  const informationCenterUrl =
    dailySummary && liffId && hasSource
      ? createLiffUrl(liffId, groupId)
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

  if (record.category === 'education' && record.expiresAt) {
    metadata.push(`上課 ${formatDate(record.expiresAt)}`);
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
          ...(informationCenterUrl
            ? [
                createPillAction('資訊中心', {
                  type: 'uri',
                  label: '開啟資訊中心',
                  uri: informationCenterUrl,
                  altUri: {
                    desktop: informationCenterUrl,
                  },
                }),
              ]
            : !dailySummary && linkUrl
            ? [
                createPillAction(linkLabel, {
                  type: 'uri',
                  label: linkActionLabel,
                  uri: linkUrl,
                  altUri: {
                    desktop: linkUrl,
                  },
                }),
              ]
            : []),
          ...(!dailySummary && record.sourceQuoteToken && !sourceUrl
            ? [
                createPillAction(
                  record.sourceReferenceType === 'image'
                    ? '看原圖'
                    : '看原訊息',
                  {
                  type: 'postback',
                    label:
                      record.sourceReferenceType === 'image'
                        ? '查看原始圖片'
                        : '查看原始訊息',
                  data: buildViewSourcePostback(record.shortId),
                  },
                ),
              ]
            : []),
          ...(!dailySummary
            ? [
                createPillAction(
                  actionLabel,
                  {
                    type: 'postback',
                    label: actionLabel,
                    data: buildCompletePostback(record.shortId),
                  },
                  actionBackground,
                  actionTextColor,
                ),
              ]
            : []),
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

function createDailySummaryFooter(liffId, groupId, pageCount) {
  if (!liffId || pageCount <= 1) {
    return undefined;
  }

  const informationCenterUrl = createLiffUrl(liffId, groupId);
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'button',
        style: 'primary',
        height: 'sm',
        action: {
          type: 'uri',
          label: '開啟資訊中心查看全部',
          uri: informationCenterUrl,
          altUri: {
            desktop: informationCenterUrl,
          },
        },
      },
    ],
  };
}

function formatQueryResult(
  records,
  filters = {},
  {
    currentTime = Date.now(),
    page = 0,
    dailySummary = false,
    liffId = null,
    groupId = null,
  } = {},
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
    bodyContents.push(
      createRecordComponents(record, filters, currentTime, {
        dailySummary,
        liffId,
        groupId,
      }),
    );
  }

  const footer = dailySummary
    ? createDailySummaryFooter(liffId, groupId, pageCount)
    : createPaginationFooter(filters, safePage, pageCount);

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
  createFunctionMenuMessage,
  createJoinMessage,
  createLiffUrl,
  formatAge,
  formatCompletedRecord,
  formatInvalidCommand,
  formatQueryResult,
  formatSavedRecord,
  getCategoryLabel,
};
