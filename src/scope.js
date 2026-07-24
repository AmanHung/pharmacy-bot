function getChatScope(source) {
  if (!source) {
    return null;
  }

  if (source.type === 'group' && source.groupId) {
    return { type: 'group', id: source.groupId };
  }

  if (source.type === 'room' && source.roomId) {
    return { type: 'room', id: source.roomId };
  }

  if (source.type === 'user' && source.userId) {
    return { type: 'user', id: source.userId };
  }

  return null;
}

function isScopeAllowed(scope, allowedGroupIds) {
  if (!scope) {
    return false;
  }

  if (
    scope.type === 'group' &&
    allowedGroupIds &&
    allowedGroupIds.size > 0
  ) {
    return allowedGroupIds.has(scope.id);
  }

  return true;
}

function toFirebaseScopeKey(scope) {
  return Buffer.from(`${scope.type}:${scope.id}`, 'utf8').toString('base64url');
}

module.exports = {
  getChatScope,
  isScopeAllowed,
  toFirebaseScopeKey,
};
