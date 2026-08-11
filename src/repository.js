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

  function imageSetsRef(scope) {
    const scopeKey = toFirebaseScopeKey(scope);
    return database.ref(`pharmacy_scopes/${scopeKey}/image_sets`);
  }

  function imageSetKey(imageSetId) {
    return Buffer.from(String(imageSetId), 'utf8').toString('base64url');
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
    if (reference.imageSetId) {
      const imageIndex = Number(reference.imageSetIndex) || 0;
      const referenceKey = imageIndex
        ? String(imageIndex).padStart(4, '0')
        : Buffer.from(String(messageId), 'utf8').toString('base64url');
      await imageSetsRef(scope)
        .child(imageSetKey(reference.imageSetId))
        .child(referenceKey)
        .set({
          ...reference,
          messageId,
        });
    }
  }

  async function getMessageReference(scope, messageId) {
    const snapshot = await messageReferencesRef(scope)
      .child(messageId)
      .once('value');
    return snapshot.exists() ? snapshot.val() : null;
  }

  async function getImageSetReferences(scope, imageSetId) {
    if (!imageSetId) {
      return [];
    }
    const snapshot = await imageSetsRef(scope)
      .child(imageSetKey(imageSetId))
      .once('value');
    return snapshotValues(snapshot).sort(
      (left, right) =>
        (Number(left.imageSetIndex) || 0) -
        (Number(right.imageSetIndex) || 0),
    );
  }

  async function removeExpiredEducationRecords(
    scope,
    activeAt,
    { onRemove = null } = {},
  ) {
    const snapshot = await recordsRef(scope).once('value');
    const updates = {};
    const removedRecords = [];

    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (
        record.category === 'education' &&
        record.status === 'open' &&
        record.expiresAt &&
        record.expiresAt < activeAt
      ) {
        updates[childSnapshot.key] = null;
        removedRecords.push(record);
      }
    });

    if (Object.keys(updates).length > 0) {
      await recordsRef(scope).update(updates);
    }
    if (onRemove) {
      await Promise.all(removedRecords.map((record) => onRemove(record)));
    }
    return removedRecords.length;
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

  async function listCompletedRecords(scope, filters = {}) {
    const snapshot = await recordsRef(scope).once('value');
    return snapshotValues(snapshot)
      .filter((record) => record.status === 'completed')
      .filter(
        (record) =>
          filters.completedSince === undefined ||
          record.completedAt >= filters.completedSince,
      )
      .sort(
        (left, right) =>
          (right.completedAt || 0) - (left.completedAt || 0),
      )
      .slice(0, filters.limit || 100);
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

  async function markRecordConvertedToSop(scope, shortId, conversion) {
    const match = await findRecordByShortId(scope, shortId);
    if (!match) {
      return null;
    }

    const updates = {
      handbookSopId: conversion.handbookSopId,
      convertedToSopAt: conversion.convertedToSopAt,
      convertedToSopByUserId: conversion.convertedToSopByUserId,
      convertedToSopByName: conversion.convertedToSopByName,
      updatedAt: conversion.convertedToSopAt,
    };
    await recordsRef(scope).child(match.key).update(updates);

    return {
      ...match.record,
      ...updates,
    };
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

  async function completeHandoverBySourceMessageId(
    scope,
    sourceMessageId,
    completion,
  ) {
    if (!sourceMessageId) {
      return null;
    }

    const snapshot = await recordsRef(scope)
      .orderByChild('sourceMessageId')
      .equalTo(sourceMessageId)
      .once('value');
    let match = null;
    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (
        !match &&
        record.category === 'handover' &&
        record.status === 'open'
      ) {
        match = {
          key: childSnapshot.key,
          record,
        };
      }
    });
    if (!match) {
      return null;
    }

    const updates = {
      status: 'completed',
      completedAt: completion.completedAt,
      completedByUserId: completion.completedByUserId,
      completedByName: completion.completedByName,
      updatedAt: completion.completedAt,
    };
    await recordsRef(scope).child(match.key).update(updates);

    return {
      ...match.record,
      ...updates,
    };
  }

  async function restoreRecord(scope, shortId, restoration) {
    const snapshot = await recordsRef(scope).once('value');
    const matches = [];
    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (record.shortId === shortId && record.status === 'completed') {
        matches.push({ key: childSnapshot.key, record });
      }
    });
    matches.sort(
      (left, right) =>
        (right.record.completedAt || 0) -
        (left.record.completedAt || 0),
    );
    const match = matches[0];
    if (!match) {
      return null;
    }

    const updates = {
      status: 'open',
      completedAt: null,
      completedByUserId: null,
      completedByName: null,
      restoredAt: restoration.restoredAt,
      restoredByUserId: restoration.restoredByUserId,
      restoredByName: restoration.restoredByName,
      updatedAt: restoration.restoredAt,
    };
    await recordsRef(scope).child(match.key).update(updates);
    return {
      ...match.record,
      ...updates,
    };
  }

  async function removeCompletedRecordsBefore(
    scope,
    cutoff,
    { onRemove = null } = {},
  ) {
    const snapshot = await recordsRef(scope).once('value');
    const updates = {};
    const removedRecords = [];
    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (
        record.status === 'completed' &&
        record.completedAt &&
        record.completedAt < cutoff
      ) {
        updates[childSnapshot.key] = null;
        removedRecords.push(record);
      }
    });
    if (Object.keys(updates).length > 0) {
      await recordsRef(scope).update(updates);
    }
    if (onRemove) {
      await Promise.all(removedRecords.map((record) => onRemove(record)));
    }
    return Object.keys(updates).length;
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
    completeHandoverBySourceMessageId,
    completeRecord,
    getImageSetReferences,
    getMessageReference,
    getRecordByShortId,
    listCompletedRecords,
    listRecords,
    markRecordConvertedToSop,
    removeCompletedRecordsBefore,
    removeExpiredEducationRecords,
    registerScope,
    saveMessageReference,
    saveRecord,
    restoreRecord,
    withdrawRecordByMessageId,
  };
}

module.exports = { createRecordRepository };
