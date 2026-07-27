const line = require('@line/bot-sdk');
const { createExpressApp } = require('./app');
const { loadConfig } = require('./config');
const { createDailySummarySender } = require('./daily-summary');
const { createEventHandler } = require('./event-handler');
const { createFirebaseDatabase } = require('./firebase');
const { createImageStorage } = require('./image-storage');
const {
  createLiffRouter,
  HISTORY_RETENTION_MS,
} = require('./liff-api');
const { createLiffAuthorizer } = require('./liff-auth');
const { createRecordRepository } = require('./repository');

function createApplication() {
  const config = loadConfig();
  const database = createFirebaseDatabase(config);
  const repository = createRecordRepository(database, {
    drugAliases: config.drugAliases,
  });
  const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken,
  });
  const blobClient = new line.messagingApi.MessagingApiBlobClient({
    channelAccessToken: config.channelAccessToken,
  });
  const imageStorage = createImageStorage({ database, blobClient });
  const handleEvent = createEventHandler({
    client,
    repository,
    imageStorage,
    liffId: config.liffId,
    allowedGroupIds: config.allowedGroupIds,
    adminUserIds: config.adminUserIds,
  });
  const sendDailySummary = createDailySummarySender({
    client,
    repository,
    groupId: config.dailySummaryGroupId,
  });
  const liffRouter =
    config.liffGroupId && config.liffChannelId
      ? createLiffRouter({
          authorize: createLiffAuthorizer({
            channelId: config.liffChannelId,
            groupId: config.liffGroupId,
            messagingClient: client,
          }),
          repository,
          imageStorage,
          groupId: config.liffGroupId,
        })
      : null;

  return createExpressApp({
    config,
    handleEvent,
    sendDailySummary,
    liffRouter,
    removeExpiredImages: imageStorage?.removeExpiredImages,
    removeExpiredHistory:
      config.liffGroupId &&
      typeof repository.removeCompletedRecordsBefore === 'function'
        ? () =>
            repository.removeCompletedRecordsBefore(
              { type: 'group', id: config.liffGroupId },
              Date.now() - HISTORY_RETENTION_MS,
            )
        : null,
  });
}

module.exports = { createApplication };
