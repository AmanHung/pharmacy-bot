const { cert, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

function createFirebaseDatabase(config) {
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(config.firebaseCredentials),
          databaseURL: config.firebaseDatabaseUrl,
        });

  return getDatabase(app);
}

module.exports = { createFirebaseDatabase };
