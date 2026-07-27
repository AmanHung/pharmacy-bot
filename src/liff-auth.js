class LiffAccessError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = 'LiffAccessError';
    this.statusCode = statusCode;
  }
}

function getBearerToken(request) {
  const authorization = request.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/iu);
  return match ? match[1].trim() : null;
}

function getRequestedGroupId(request, defaultGroupId = null) {
  const headerGroupId = request.get('x-line-group-id');
  const queryGroupId = request.query?.groupId;
  const requestedGroupId =
    (typeof headerGroupId === 'string' && headerGroupId.trim()) ||
    (typeof queryGroupId === 'string' && queryGroupId.trim()) ||
    defaultGroupId;
  return requestedGroupId || null;
}

async function verifyLineIdToken(idToken, channelId, fetchImpl = fetch) {
  if (!idToken || !channelId) {
    throw new LiffAccessError('LIFF authentication is not configured.');
  }

  const response = await fetchImpl('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    }),
  });

  if (!response.ok) {
    throw new LiffAccessError('LINE login has expired.');
  }

  const payload = await response.json();
  if (!payload.sub) {
    throw new LiffAccessError('LINE user identity is unavailable.');
  }

  return {
    userId: payload.sub,
    displayName: payload.name || null,
    pictureUrl: payload.picture || null,
  };
}

function createLiffAuthorizer({
  channelId,
  groupId = null,
  allowedGroupIds = new Set(),
  messagingClient,
  fetchImpl = fetch,
}) {
  return async function authorizeLiffRequest(request) {
    const requestedGroupId = getRequestedGroupId(request, groupId);
    const configuredGroupIds = new Set(allowedGroupIds);
    if (groupId) {
      configuredGroupIds.add(groupId);
    }

    if (!channelId || !requestedGroupId) {
      throw new LiffAccessError('LIFF is not configured.', 503);
    }
    if (
      configuredGroupIds.size > 0 &&
      !configuredGroupIds.has(requestedGroupId)
    ) {
      throw new LiffAccessError('此群組尚未開放資訊中心。', 403);
    }

    const identity = await verifyLineIdToken(
      getBearerToken(request),
      channelId,
      fetchImpl,
    );

    try {
      const memberProfile = await messagingClient.getGroupMemberProfile(
        requestedGroupId,
        identity.userId,
      );
      return {
        ...identity,
        displayName: memberProfile.displayName || identity.displayName,
        groupId: requestedGroupId,
      };
    } catch {
      throw new LiffAccessError(
        '您目前不是此群組成員，無法查看資訊。',
        403,
      );
    }
  };
}

module.exports = {
  LiffAccessError,
  createLiffAuthorizer,
  getBearerToken,
  getRequestedGroupId,
  verifyLineIdToken,
};
