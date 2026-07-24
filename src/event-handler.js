const { parseCommand } = require('./commands');
const { extractNoticeDeadline } = require('./deadlines');
const { createShortId } = require('./identifiers');
const {
  FUNCTION_MENU_MESSAGE,
  JOIN_MESSAGE,
  formatInvalidCommand,
  formatQueryResult,
} = require('./messages');
const { parsePostback } = require('./postbacks');
const { getChatScope, isScopeAllowed } = require('./scope');

const RECENT_QUERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const QUERY_RESULT_LIMIT = 100;

function isBotMentioned(message) {
  return (
    message?.mention?.mentionees?.some(
      (mention) => mention.type === 'user' && mention.isSelf === true,
    ) || false
  );
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

function createEventHandler({
  client,
  repository,
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
    const markAsReadToken = event.message?.markAsReadToken;
    if (
      !markAsReadToken ||
      typeof client.markMessagesAsReadByToken !== 'function'
    ) {
      return null;
    }

    try {
      return await client.markMessagesAsReadByToken({ markAsReadToken });
    } catch (error) {
      console.warn('Unable to mark LINE message as read:', error.message);
      return null;
    }
  }

  function canComplete(event) {
    return (
      adminUserIds.size === 0 ||
      (event.source?.userId && adminUserIds.has(event.source.userId))
    );
  }

  async function completeRecord(event, scope, shortId) {
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

    return acknowledgeSilently(event);
  }

  async function queryRecords(event, scope, command, page = 0) {
    const currentTime = event.timestamp || now();
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

  return async function handleEvent(event) {
    const scope = getChatScope(event.source);
    if (!isScopeAllowed(scope, allowedGroupIds)) {
      return null;
    }

    if (event.type === 'join') {
      return reply(event, JOIN_MESSAGE);
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
        return completeRecord(event, scope, action.shortId);
      }
      return queryRecords(event, scope, action, action.page);
    }

    if (event.type !== 'message' || event.message?.type !== 'text') {
      return null;
    }

    if (isBotMentioned(event.message)) {
      return reply(event, FUNCTION_MENU_MESSAGE);
    }

    const command = parseCommand(event.message.text);
    if (command.type === 'ignore') {
      return null;
    }

    if (command.type === 'invalid') {
      return reply(event, formatInvalidCommand(command));
    }

    if (command.type === 'help') {
      return reply(event, FUNCTION_MENU_MESSAGE);
    }

    if (command.type === 'add') {
      if (!command.content) {
        return reply(event, formatInvalidCommand(command));
      }

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

      const createdAt = event.timestamp || now();
      const eventKey =
        event.webhookEventId || event.message.id || `${createdAt}`;
      const authorName = await getDisplayName(client, event.source);
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
  isBotMentioned,
};
