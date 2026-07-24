const line = require('@line/bot-sdk');
const { createExpressApp } = require('./app');
const { loadConfig } = require('./config');
const { createDailySummarySender } = require('./daily-summary');
const { createEventHandler } = require('./event-handler');
const { createFirebaseDatabase } = require('./firebase');
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
  const handleEvent = createEventHandler({
    client,
    repository,
    allowedGroupIds: config.allowedGroupIds,
    adminUserIds: config.adminUserIds,
  });
  const sendDailySummary = createDailySummarySender({
    client,
    repository,
    groupId: config.dailySummaryGroupId,
  });

  return createExpressApp({ config, handleEvent, sendDailySummary });
}

module.exports = { createApplication };
