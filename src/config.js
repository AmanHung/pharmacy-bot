require('dotenv').config({ quiet: true });
const { parseDrugAliases } = require('./search');

const DEFAULT_DATABASE_URL =
  'https://pharmacy-bot-fd2cb-default-rtdb.asia-southeast1.firebasedatabase.app';

function requireEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseFirebaseCredentials(rawCredentials) {
  try {
    return JSON.parse(rawCredentials);
  } catch {
    throw new Error('FIREBASE_CREDENTIALS must be valid JSON.');
  }
}

function parseAllowedGroupIds(rawValue = '') {
  return new Set(
    rawValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function loadConfig() {
  return {
    channelAccessToken: requireEnvironmentVariable('CHANNEL_ACCESS_TOKEN'),
    channelSecret: requireEnvironmentVariable('CHANNEL_SECRET'),
    firebaseCredentials: parseFirebaseCredentials(
      requireEnvironmentVariable('FIREBASE_CREDENTIALS'),
    ),
    firebaseDatabaseUrl:
      process.env.FIREBASE_DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    allowedGroupIds: parseAllowedGroupIds(process.env.ALLOWED_GROUP_IDS),
    adminUserIds: parseAllowedGroupIds(process.env.ADMIN_USER_IDS),
    drugAliases: parseDrugAliases(process.env.DRUG_ALIASES_JSON),
    dailySummaryGroupId:
      process.env.DAILY_SUMMARY_GROUP_ID?.trim() || null,
    cronSecret: process.env.CRON_SECRET?.trim() || null,
    liffId: process.env.LIFF_ID?.trim() || null,
    liffChannelId: process.env.LIFF_CHANNEL_ID?.trim() || null,
    liffGroupId:
      process.env.LIFF_GROUP_ID?.trim() ||
      process.env.DAILY_SUMMARY_GROUP_ID?.trim() ||
      null,
    handbookFirebaseProjectId:
      process.env.HANDBOOK_FIREBASE_PROJECT_ID?.trim() || null,
    handbookGasApiUrl:
      process.env.HANDBOOK_GAS_API_URL?.trim() || null,
  };
}

module.exports = {
  loadConfig,
  parseAllowedGroupIds,
  parseFirebaseCredentials,
};
