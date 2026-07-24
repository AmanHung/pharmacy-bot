const { parseCommand } = require('./commands');
const { createShortId } = require('./identifiers');
const {
  HELP_MESSAGE,
  formatCompletedRecord,
  formatInvalidCommand,
  formatQueryResult,
  formatSavedRecord,
} = require('./messages');
const { getChatScope, isScopeAllowed } = require('./scope');

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
  now = () => Date.now(),
}) {
  async function reply(event, text) {
    if (!event.replyToken) {
      return null;
    }
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text }],
    });
  }

  return async function handleEvent(event) {
    const scope = getChatScope(event.source);
    if (!isScopeAllowed(scope, allowedGroupIds)) {
      return null;
    }

    if (event.type === 'join') {
      return reply(event, HELP_MESSAGE);
    }

    if (event.type === 'unsend' && event.unsend?.messageId) {
      await repository.withdrawRecordByMessageId(
        scope,
        event.unsend.messageId,
        event.timestamp || now(),
      );
      return null;
    }

    if (event.type !== 'message' || event.message?.type !== 'text') {
      return null;
    }

    const command = parseCommand(event.message.text);
    if (command.type === 'ignore') {
      return null;
    }

    if (command.type === 'invalid') {
      return reply(event, formatInvalidCommand(command));
    }

    if (command.type === 'help') {
      return reply(event, HELP_MESSAGE);
    }

    if (command.type === 'add') {
      if (!command.content) {
        return reply(event, formatInvalidCommand(command));
      }

      const createdAt = event.timestamp || now();
      const eventKey =
        event.webhookEventId || event.message.id || `${createdAt}`;
      const authorName = await getDisplayName(client, event.source);
      const record = {
        shortId: createShortId(command.category, eventKey, createdAt),
        category: command.category,
        content: command.content,
        status: 'open',
        authorUserId: event.source.userId || null,
        authorName,
        createdAt,
        updatedAt: createdAt,
        sourceType: scope.type,
        sourceId: scope.id,
        sourceMessageId: event.message.id || null,
        webhookEventId: event.webhookEventId || null,
      };
      const result = await repository.saveRecord(scope, eventKey, record);

      if (result.duplicate) {
        return null;
      }

      return reply(event, formatSavedRecord(record));
    }

    if (command.type === 'query') {
      const records = await repository.listRecords(scope, {
        category: command.category,
        keyword: command.keyword,
        limit: 10,
      });
      return reply(event, formatQueryResult(records, command));
    }

    if (!command.shortId) {
      return reply(event, formatInvalidCommand(command));
    }

    const completedByName = await getDisplayName(client, event.source);
    const completedAt = event.timestamp || now();
    const record = await repository.completeRecord(scope, command.shortId, {
      completedAt,
      completedByUserId: event.source.userId || null,
      completedByName,
    });

    if (!record) {
      return reply(event, `找不到編號 ${command.shortId}。`);
    }

    return reply(event, formatCompletedRecord(record));
  };
}

module.exports = {
  createEventHandler,
  getDisplayName,
};
