const line = require('@line/bot-sdk');
const { createExpressApp } = require('./app');
const { loadConfig } = require('./config');
const { createDailySummarySender } = require('./daily-summary');
const { createEventHandler } = require('./event-handler');
const {
  createFirebaseDatabase,
  createHandbookFirestore,
} = require('./firebase');
const { createHandbookSopPublisher } = require('./handbook-sop');
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
  const sopPublisher = createHandbookSopPublisher({
    firestore: createHandbookFirestore(config),
    gasApiUrl: config.handbookGasApiUrl,
  });
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
    liffId: config.liffId,
  });
  const liffRouter =
    config.liffGroupId && config.liffChannelId
      ? createLiffRouter({
          authorize: createLiffAuthorizer({
            channelId: config.liffChannelId,
            groupId: config.liffGroupId,
            allowedGroupIds: config.allowedGroupIds,
            messagingClient: client,
          }),
          repository,
          imageStorage,
          sopPublisher,
        })
      : null;

  return createExpressApp({
    config,
    handleEvent,
    sendDailySummary,
    liffRouter,
    removeExpiredHistory:
      config.liffGroupId &&
      typeof repository.removeCompletedRecordsBefore === 'function'
        ? () =>
            repository.removeCompletedRecordsBefore(
              { type: 'group', id: config.liffGroupId },
              Date.now() - HISTORY_RETENTION_MS,
              {
                onRemove: async (record) => {
                  if (!imageStorage?.deleteImage) {
                    return;
                  }
                  const imagePaths = [];
                  if (
                    record.sourceImageSetId &&
                    typeof repository.getImageSetReferences === 'function'
                  ) {
                    const references =
                      await repository.getImageSetReferences(
                        { type: 'group', id: config.liffGroupId },
                        record.sourceImageSetId,
                      );
                    imagePaths.push(
                      ...references
                        .map((reference) => reference.storagePath)
                        .filter(Boolean),
                    );
                  }
                  if (imagePaths.length === 0 && record.sourceImagePath) {
                    imagePaths.push(record.sourceImagePath);
                  }
                  await Promise.all(
                    [...new Set(imagePaths)].map((path) =>
                      imageStorage.deleteImage(path),
                    ),
                  );
                },
              },
            )
        : null,
  });
}

module.exports = { createApplication };
