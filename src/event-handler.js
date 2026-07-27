const { parseCommand } = require('./commands');
const { extractEducationDeadline, extractNoticeDeadline } = require('./deadlines');
const { createShortId } = require('./identifiers');
const {
  createFunctionMenuMessage,
  createJoinMessage,
  formatCompletedRecord,
  formatInvalidCommand,
  formatQueryResult,
} = require('./messages');
const { parsePostback } = require('./postbacks');
const { getChatScope, isScopeAllowed } = require('./scope');

const RECENT_QUERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const QUERY_RESULT_LIMIT = 100;

function hasIndividualMemberMention(mention) {
  return Boolean(
    mention?.mentionees?.some(
      (mentionee) =>
        mentionee.type === 'user' &&
        mentionee.isSelf !== true &&
        Boolean(mentionee.userId),
    ),
  );
}

function getAutomaticRecordCategory(text, mention = null) {
  const normalized = String(text || '').replace(/\s+/gu, '');
  const categories = [
    { category: 'medication', keywords: /(缺藥|換藥|鎖檔|開檔)/u },
    { category: 'handover', keywords: /交班/u },
    { category: 'education', keywords: /(上課|課程)/u },
    { category: 'notice', keywords: /(?:公告|@all)/iu },
  ];
  const match = categories.find(({ keywords }) => keywords.test(normalized));
  if (!match) {
    return hasIndividualMemberMention(mention) ? 'handover' : false;
  }

  if (
    new RegExp(
      `(沒有|無|未|免|不用|不需)(?:${match.keywords.source})`,
      'u',
    ).test(normalized)
  ) {
    return null;
  }

  return match.category;
}

function extractFirstWebUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/iu);
  if (!match) {
    return null;
  }

  const candidate = match[0].replace(/[),，。！？!?；;：:\]}]+$/u, '');
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

async function getDisplayName(client, source) {
  if (!source?.userId) {
    return '未知同仁';
  }

  try {
    if (source.type === 'group') {
      const profile = await client.getGroupMemberProfile(
        source.groupId,
        source.userId,
      );
      return profile.displayName;
    }

    if (source.type === 'room') {
      const profile = await client.getRoomMemberProfile(
        source.roomId,
        source.userId,
      );
      return profile.displayName;
    }

    const profile = await client.getProfile(source.userId);
    return profile.displayName;
  } catch (error) {
    console.warn('Unable to retrieve LINE display name:', error.message);
    return '未知同仁';
  }
}

async function getGroupName(client, source) {
  if (source?.type !== 'group' || !source.groupId) {
    return null;
  }

  try {
    const summary = await client.getGroupSummary(source.groupId);
    return summary.groupName || null;
  } catch (error) {
    console.warn('Unable to retrieve LINE group name:', error.message);
    return null;
  }
}

function createEventHandler({
  client,
  repository,
  imageStorage = null,
  liffId = null,
  allowedGroupIds = new Set(),
  adminUserIds = new Set(),
  now = () => Date.now(),
}) {
  async function reply(event, message) {
    if (!event.replyToken) {
      return null;
    }
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        typeof message === 'string' ? { type: 'text', text: message } : message,
      ],
    });
  }

  async function acknowledgeSilently(event) {
    return null;
  }

  function canComplete(event) {
    return (
      adminUserIds.size === 0 ||
      (event.source?.userId && adminUserIds.has(event.source.userId))
    );
  }

  async function deleteRecordImage(record) {
    if (record.sourceImagePath && imageStorage?.deleteImage) {
      await imageStorage.deleteImage(record.sourceImagePath);
    }
  }

  async function completeRecord(
    event,
    scope,
    shortId,
    { announce = false } = {},
  ) {
    if (!shortId) {
      return reply(event, formatInvalidCommand({ type: 'complete' }));
    }

    if (!canComplete(event)) {
      return reply(event, '你沒有標記完成的權限。');
    }

    const completedByName = await getDisplayName(client, event.source);
    const completedAt = event.timestamp || now();
    const record = await repository.completeRecord(scope, shortId, {
      completedAt,
      completedByUserId: event.source.userId || null,
      completedByName,
    });

    if (!record) {
      return reply(event, `找不到編號 ${shortId}。`);
    }

    if (announce && record.category === 'handover') {
      return reply(event, formatCompletedRecord(record));
    }

    return acknowledgeSilently(event);
  }

  async function queryRecords(event, scope, command, page = 0) {
    const currentTime = event.timestamp || now();
    if (
      command.category === 'education' &&
      typeof repository.removeExpiredEducationRecords === 'function'
    ) {
      await repository.removeExpiredEducationRecords(scope, currentTime, {
        onRemove: deleteRecordImage,
      });
    }
    const filters = {
      category: command.category,
      keyword: command.keyword,
      limit: QUERY_RESULT_LIMIT,
      activeAt: currentTime,
    };
    if (command.type === 'query' && command.category === 'handover') {
      filters.createdSince = currentTime - RECENT_QUERY_WINDOW_MS;
    }

    const records = await repository.listRecords(scope, filters);
    return reply(
      event,
      formatQueryResult(records, command, { currentTime, page }),
    );
  }

  async function showSourceMessage(event, scope, shortId) {
    const record = await repository.getRecordByShortId(scope, shortId);
    if (!record?.sourceQuoteToken) {
      return reply(event, '這筆資訊沒有可返回的原始訊息。');
    }

    const sourceLabel =
      record.sourceReferenceType === 'image' ? '原始圖片' : '原始訊息';

    return reply(event, {
      type: 'text',
      text: `${sourceLabel}：${record.content}`,
      quoteToken: record.sourceQuoteToken,
    });
  }

  return async function handleEvent(event) {
    const scope = getChatScope(event.source);
    if (!isScopeAllowed(scope, allowedGroupIds)) {
      return null;
    }

    if (event.type === 'join') {
      const registeredAt = event.timestamp || now();
      const groupName = await getGroupName(client, event.source);
      await repository.registerScope(scope, {
        groupName,
        registeredAt,
      });
      return reply(event, createJoinMessage(liffId, scope.id));
    }

    if (event.type === 'unsend' && event.unsend?.messageId) {
      await repository.withdrawRecordByMessageId(
        scope,
        event.unsend.messageId,
        event.timestamp || now(),
      );
      return null;
    }

    if (event.type === 'postback') {
      const action = parsePostback(event.postback?.data);
      if (!action) {
        return null;
      }
      if (action.type === 'complete') {
        return completeRecord(event, scope, action.shortId, {
          announce: true,
        });
      }
      if (action.type === 'view-source') {
        return showSourceMessage(event, scope, action.shortId);
      }
      return queryRecords(event, scope, action, action.page);
    }

    if (event.type !== 'message') {
      return null;
    }

    if (event.message?.type === 'image') {
      if (
        event.message.id &&
        event.message.quoteToken &&
        typeof repository.saveMessageReference === 'function'
      ) {
        let storedImage = null;
        if (imageStorage) {
          try {
            storedImage = await imageStorage.saveLineImage(
              scope,
              event.message.id,
            );
          } catch (error) {
            console.warn('Unable to store LINE image:', error.message);
          }
        }
        await repository.saveMessageReference(scope, event.message.id, {
          type: 'image',
          quoteToken: event.message.quoteToken,
          authorUserId: event.source?.userId || null,
          createdAt: event.timestamp || now(),
          ...(storedImage
            ? {
                storagePath: storedImage.storagePath,
                contentType: storedImage.contentType,
                size: storedImage.size,
              }
            : {}),
        });
      }
      return null;
    }

    if (event.message?.type !== 'text') {
      return null;
    }

    if (
      event.message.id &&
      event.message.quoteToken &&
      typeof repository.saveMessageReference === 'function'
    ) {
      await repository.saveMessageReference(scope, event.message.id, {
        type: 'text',
        quoteToken: event.message.quoteToken,
        url: extractFirstWebUrl(event.message.text),
        authorUserId: event.source?.userId || null,
        createdAt: event.timestamp || now(),
      });
    }

    let command = parseCommand(event.message.text);
    if (command.type === 'ignore') {
      const automaticCategory = getAutomaticRecordCategory(
        event.message.text,
        event.message.mention,
      );
      if (!automaticCategory) {
        return null;
      }
      command = {
        type: 'add',
        category: automaticCategory,
        content: event.message.text.trim(),
      };
    }

    if (command.type === 'invalid') {
      return reply(event, formatInvalidCommand(command));
    }

    if (command.type === 'help') {
      return reply(event, createFunctionMenuMessage(liffId, scope.id));
    }
    if (command.type === 'intro') {
      return reply(event, createJoinMessage(liffId, scope.id));
    }

    if (command.type === 'add') {
      if (!command.content) {
        return reply(event, formatInvalidCommand(command));
      }

      const createdAt = event.timestamp || now();
      let content = command.content;
      let expiresAt = null;
      if (command.category === 'notice') {
        const deadline = extractNoticeDeadline(command.content);
        if (deadline.error || !deadline.content) {
          return reply(
            event,
            formatInvalidCommand({
              type: 'add',
              reason: deadline.error || 'empty-content',
            }),
          );
        }
        content = deadline.content;
        expiresAt = deadline.expiresAt;
      }
      if (command.category === 'education') {
        expiresAt = extractEducationDeadline(content, createdAt);
      }

      const eventKey =
        event.webhookEventId || event.message.id || `${createdAt}`;
      const authorName = await getDisplayName(client, event.source);
      const quotedMessageId = event.message.quotedMessageId || null;
      const sourceReference =
        quotedMessageId &&
        typeof repository.getMessageReference === 'function'
          ? await repository.getMessageReference(scope, quotedMessageId)
          : null;

      const record = {
        shortId: createShortId(command.category, eventKey, createdAt),
        category: command.category,
        content,
        status: 'open',
        authorUserId: event.source.userId || null,
        authorName,
        createdAt,
        updatedAt: createdAt,
        sourceType: scope.type,
        sourceId: scope.id,
        sourceMessageId: event.message.id || null,
        webhookEventId: event.webhookEventId || null,
        ...(sourceReference?.quoteToken
          ? {
              sourceReferenceMessageId: quotedMessageId,
              sourceReferenceType: sourceReference.type || 'text',
              sourceQuoteToken: sourceReference.quoteToken,
              ...(sourceReference.url ? { sourceUrl: sourceReference.url } : {}),
              ...(sourceReference.storagePath
                ? {
                    sourceImagePath: sourceReference.storagePath,
                  }
                : {}),
            }
          : {}),
        ...(expiresAt ? { expiresAt } : {}),
      };
      const result = await repository.saveRecord(scope, eventKey, record);

      if (result.duplicate) {
        return null;
      }

      return acknowledgeSilently(event);
    }

    if (command.type === 'query' || command.type === 'open-query') {
      return queryRecords(event, scope, command);
    }

    return completeRecord(event, scope, command.shortId);
  };
}

module.exports = {
  createEventHandler,
  getDisplayName,
  getGroupName,
};
