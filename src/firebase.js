const { cert, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');

function getFirebaseApp(config) {
  return (
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(config.firebaseCredentials),
          databaseURL: config.firebaseDatabaseUrl,
          ...(config.firebaseStorageBucket
            ? { storageBucket: config.firebaseStorageBucket }
            : {}),
        })
  );
}

function createFirebaseDatabase(config) {
  return getDatabase(getFirebaseApp(config));
}

function createFirebaseStorage(config) {
  if (!config.firebaseStorageBucket) {
    return null;
  }

  return getStorage(getFirebaseApp(config));
}

module.exports = { createFirebaseDatabase, createFirebaseStorage };
