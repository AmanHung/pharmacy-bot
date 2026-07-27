const { cert, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

function getFirebaseApp(config) {
  return (
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(config.firebaseCredentials),
          databaseURL: config.firebaseDatabaseUrl,
        })
  );
}

function createFirebaseDatabase(config) {
  return getDatabase(getFirebaseApp(config));
}

module.exports = { createFirebaseDatabase };
