const { toFirebaseScopeKey } = require('./scope');

const MAX_QUERY_CANDIDATES = 100;

function snapshotValues(snapshot) {
  const values = [];
  if (!snapshot.exists()) {
    return values;
  }
  snapshot.forEach((childSnapshot) => {
    values.push(childSnapshot.val());
  });
  return values;
}

function createRecordRepository(database) {
  function recordsRef(scope) {
    const scopeKey = toFirebaseScopeKey(scope);
    return database.ref(`pharmacy_scopes/${scopeKey}/records`);
  }

  async function saveRecord(scope, eventKey, record) {
    const recordRef = recordsRef(scope).child(eventKey);
    const transaction = await recordRef.transaction((currentRecord) => {
      if (currentRecord !== null) {
        return undefined;
      }
      return record;
    });

    return {
      record: transaction.snapshot.val(),
      duplicate: !transaction.committed,
    };
  }

  async function listRecords(scope, filters = {}) {
    const snapshot = await recordsRef(scope)
      .orderByChild('createdAt')
      .limitToLast(MAX_QUERY_CANDIDATES)
      .once('value');

    const keyword = (filters.keyword || '').trim().toLocaleLowerCase('zh-TW');
    return snapshotValues(snapshot)
      .filter((record) => record.status === 'open')
      .filter(
        (record) =>
          !filters.category || record.category === filters.category,
      )
      .filter(
        (record) =>
          filters.createdSince === undefined ||
          record.createdAt >= filters.createdSince,
      )
      .filter((record) => {
        if (!keyword) {
          return true;
        }
        const searchableText = [
          record.shortId,
          record.content,
          record.authorName,
        ]
          .join(' ')
          .toLocaleLowerCase('zh-TW');
        return searchableText.includes(keyword);
      })
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, filters.limit || 10);
  }

  async function findRecordByShortId(scope, shortId) {
    const snapshot = await recordsRef(scope)
      .orderByChild('shortId')
      .equalTo(shortId)
      .limitToFirst(1)
      .once('value');

    let result = null;
    snapshot.forEach((childSnapshot) => {
      result = {
        key: childSnapshot.key,
        record: childSnapshot.val(),
      };
    });
    return result;
  }

  async function completeRecord(scope, shortId, completion) {
    const match = await findRecordByShortId(scope, shortId);
    if (!match) {
      return null;
    }

    const updatedRecord = {
      ...match.record,
      status: 'completed',
      completedAt: completion.completedAt,
      completedByUserId: completion.completedByUserId,
      completedByName: completion.completedByName,
      updatedAt: completion.completedAt,
    };
    await recordsRef(scope).child(match.key).set(updatedRecord);
    return updatedRecord;
  }

  async function withdrawRecordByMessageId(scope, messageId, withdrawnAt) {
    const snapshot = await recordsRef(scope)
      .orderByChild('sourceMessageId')
      .equalTo(messageId)
      .once('value');
    const updates = {};

    snapshot.forEach((childSnapshot) => {
      updates[`${childSnapshot.key}/content`] = null;
      updates[`${childSnapshot.key}/status`] = 'withdrawn';
      updates[`${childSnapshot.key}/withdrawnAt`] = withdrawnAt;
      updates[`${childSnapshot.key}/updatedAt`] = withdrawnAt;
    });

    if (Object.keys(updates).length > 0) {
      await recordsRef(scope).update(updates);
    }
  }

  return {
    completeRecord,
    listRecords,
    saveRecord,
    withdrawRecordByMessageId,
  };
}

module.exports = { createRecordRepository };
