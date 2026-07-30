const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getFirestore } = require('firebase-admin/firestore');

function getFirebaseApp(config) {
  const defaultApp = getApps().find((app) => app.name === '[DEFAULT]');
  return (
    defaultApp ||
    initializeApp({
      credential: cert(config.firebaseCredentials),
      databaseURL: config.firebaseDatabaseUrl,
    })
  );
}

function createFirebaseDatabase(config) {
  return getDatabase(getFirebaseApp(config));
}

function createHandbookFirestore(config) {
  if (!config.handbookFirebaseProjectId) {
    return null;
  }

  const appName = 'handbook-firestore';
  const existingApp = getApps().find((app) => app.name === appName);
  const app =
    existingApp ||
    initializeApp(
      {
        credential: cert(config.firebaseCredentials),
        projectId: config.handbookFirebaseProjectId,
      },
      appName,
    );

  return getFirestore(app);
}

module.exports = {
  createFirebaseDatabase,
  createHandbookFirestore,
};
