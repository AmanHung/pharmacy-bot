const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LiffAccessError,
  createLiffAuthorizer,
  getBearerToken,
  verifyLineIdToken,
} = require('../src/liff-auth');

function requestWithAuthorization(value) {
  return {
    get(name) {
      return name === 'authorization' ? value : null;
    },
  };
}

test('從 Authorization 標頭取得 LIFF ID token', () => {
  assert.equal(
    getBearerToken(requestWithAuthorization('Bearer id-token')),
    'id-token',
  );
  assert.equal(getBearerToken(requestWithAuthorization('invalid')), null);
});

test('向 LINE 驗證 ID token 並取得使用者身分', async () => {
  let requestBody;
  const identity = await verifyLineIdToken(
    'id-token',
    'login-channel-id',
    async (_url, options) => {
      requestBody = String(options.body);
      return {
        ok: true,
        async json() {
          return { sub: 'U1', name: '王藥師' };
        },
      };
    },
  );

  assert.match(requestBody, /id_token=id-token/);
  assert.match(requestBody, /client_id=login-channel-id/);
  assert.deepEqual(identity, {
    userId: 'U1',
    displayName: '王藥師',
    pictureUrl: null,
  });
});

test('僅允許目前仍在指定群組的 LINE 使用者', async () => {
  const authorize = createLiffAuthorizer({
    channelId: 'login-channel-id',
    groupId: 'G1',
    messagingClient: {
      async getGroupMemberProfile(groupId, userId) {
        assert.equal(groupId, 'G1');
        assert.equal(userId, 'U1');
        return { displayName: '王藥師' };
      },
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { sub: 'U1' };
      },
    }),
  });

  const member = await authorize(
    requestWithAuthorization('Bearer id-token'),
  );

  assert.equal(member.userId, 'U1');
  assert.equal(member.displayName, '王藥師');
});

test('已移出群組的使用者會被拒絕', async () => {
  const authorize = createLiffAuthorizer({
    channelId: 'login-channel-id',
    groupId: 'G1',
    messagingClient: {
      async getGroupMemberProfile() {
        throw new Error('Not found');
      },
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { sub: 'U1' };
      },
    }),
  });

  await assert.rejects(
    authorize(requestWithAuthorization('Bearer id-token')),
    (error) =>
      error instanceof LiffAccessError && error.statusCode === 403,
  );
});
