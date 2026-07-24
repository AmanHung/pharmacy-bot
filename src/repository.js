const { toFirebaseScopeKey } = require('./scope');
const { createSearchTerms, normalizeSearchText } = require('./search');

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

function createRecordRepository(database, { drugAliases = [] } = {}) {
  function scopeRef(scope) {
    const scopeKey = toFirebaseScopeKey(scope);
    return database.ref(`pharmacy_scopes/${scopeKey}`);
  }

  function recordsRef(scope) {
    const scopeKey = toFirebaseScopeKey(scope);
    return database.ref(`pharmacy_scopes/${scopeKey}/records`);
  }

  function messageReferencesRef(scope) {
    const scopeKey = toFirebaseScopeKey(scope);
    return database.ref(`pharmacy_scopes/${scopeKey}/message_references`);
  }

  async function registerScope(scope, metadata = {}) {
    await scopeRef(scope).child('metadata').update({
      sourceType: scope.type,
      sourceId: scope.id,
      groupName: metadata.groupName || null,
      registeredAt: metadata.registeredAt,
      updatedAt: metadata.registeredAt,
    });
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

  async function saveMessageReference(scope, messageId, reference) {
    await messageReferencesRef(scope).child(messageId).set(reference);
  }

  async function getMessageReference(scope, messageId) {
    const snapshot = await messageReferencesRef(scope)
      .child(messageId)
      .once('value');
    return snapshot.exists() ? snapshot.val() : null;
  }

  async function removeExpiredEducationRecords(scope, activeAt) {
    const snapshot = await recordsRef(scope).once('value');
    const updates = {};

    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (
        record.category === 'education' &&
        record.status === 'open' &&
        record.expiresAt &&
        record.expiresAt < activeAt
      ) {
        updates[childSnapshot.key] = null;
      }
    });

    if (Object.keys(updates).length > 0) {
      await recordsRef(scope).update(updates);
    }
  }

  async function listRecords(scope, filters = {}) {
    const snapshot = await recordsRef(scope)
      .orderByChild('createdAt')
      .limitToLast(MAX_QUERY_CANDIDATES)
      .once('value');

    const searchTerms = createSearchTerms(filters.keyword, drugAliases);
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
      .filter(
        (record) =>
          filters.activeAt === undefined ||
          !record.expiresAt ||
          record.expiresAt >= filters.activeAt,
      )
      .filter((record) => {
        if (searchTerms.length === 0) {
          return true;
        }
        const searchableText = normalizeSearchText(
          [
            record.shortId,
            record.content,
            record.category === 'handover' ? record.authorName : '',
          ].join(' '),
        );
        return searchTerms.some((term) => searchableText.includes(term));
      })
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, filters.limit || 10);
  }

  async function findRecordByShortId(scope, shortId) {
    const snapshot = await recordsRef(scope)
      .orderByChild('createdAt')
      .limitToLast(MAX_QUERY_CANDIDATES)
      .once('value');

    const matches = [];
    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (record.shortId === shortId) {
        matches.push({
          key: childSnapshot.key,
          record,
        });
      }
    });

    matches.sort((left, right) => {
      const leftIsOpen = left.record.status === 'open';
      const rightIsOpen = right.record.status === 'open';
      if (leftIsOpen !== rightIsOpen) {
        return leftIsOpen ? -1 : 1;
      }
      return (right.record.createdAt || 0) - (left.record.createdAt || 0);
    });

    return matches[0] || null;
  }

  async function getRecordByShortId(scope, shortId) {
    const match = await findRecordByShortId(scope, shortId);
    return match?.record || null;
  }

  async function completeRecord(scope, shortId, completion) {
    const match = await findRecordByShortId(scope, shortId);
    if (!match) {
      return null;
    }

    if (match.record.status !== 'open') {
      return {
        ...match.record,
        alreadyCompleted: true,
      };
    }

    const recordRef = recordsRef(scope).child(match.key);
    const updates = {
      status: 'completed',
      completedAt: completion.completedAt,
      completedByUserId: completion.completedByUserId,
      completedByName: completion.completedByName,
      updatedAt: completion.completedAt,
    };

    await recordRef.update(updates);

    return {
      ...match.record,
      ...updates,
    };
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
    getMessageReference,
    getRecordByShortId,
    listRecords,
    removeExpiredEducationRecords,
    registerScope,
    saveMessageReference,
    saveRecord,
    withdrawRecordByMessageId,
  };
}

module.exports = { createRecordRepository };
