import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountInfo, normalizeAccount, normalizeAvatar, parseMembershipDate } from '../src/core/account.js';

const now = new Date(2026, 10, 19, 12).getTime();
const profile = { id: '123', name: '测试用户', photo: '/photo/test.png', level: 0 };
const cookies = { get: async ({ name }) => name === 'jwtToken' ? { value: 'test-token' } : null };
const json = data => new Response(JSON.stringify(data));

test('账号只返回显示需要的字段，不传递 token、手机号和邮箱', () => {
  assert.deepEqual(normalizeAccount({ ...profile, token: 'secret', phone: 'private', email: 'private' }, now), {
    nickname: '测试用户', avatarUrl: 'https://api2.mubu.com/v3/photo/test.png', membership: 'free', expiresOn: ''
  });
  assert.throws(() => normalizeAccount({ level: 2 }));
});

test('头像支持官方相对路径和 HTTPS 图片，拒绝可执行协议', () => {
  assert.equal(normalizeAvatar('photo/test.png'), 'https://api2.mubu.com/v3/photo/test.png');
  assert.equal(normalizeAvatar('https://example.com/avatar.png'), 'https://example.com/avatar.png');
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,test', 'http://example.com/a', 'https://user:pass@example.com']) {
    assert.equal(normalizeAvatar(value), '');
  }
});

test('会员识别遵循官网 MAX 优先、VIP 等级或有效到期日规则', () => {
  const member = extra => normalizeAccount({ ...profile, ...extra }, now);
  assert.equal(member({ level: 2 }).membership, 'vip');
  assert.equal(member({ level: '3', maxEndDate: '20261119', vipEndDate: '2027/12/01' }).membership, 'max');
  assert.equal(member({ level: 3, maxEndDate: '20261118', vipEndDate: '2027/12/01' }).membership, 'vip');
  assert.equal(member({ level: 3, maxEndDate: '20261118' }).membership, 'free');
  assert.equal(member({ level: null }).membership, 'unknown');
  assert.equal(member({ level: 3 }).membership, 'unknown');
  assert.equal(member({ level: 0, vipEndDate: '2026-11-18' }).membership, 'free');
  assert.equal(member({ level: 2, vipEndDate: '20261119' }).expiresOn, '2026-11-19');
});

test('到期日期支持秒/毫秒和日历日期，当天有效且不接受非法日期', () => {
  for (const input of ['20261119', '2026/11/19', '2026-11-19']) {
    assert.ok(parseMembershipDate(input).getTime() > now);
  }
  assert.equal(parseMembershipDate(now / 1000).getTime(), now);
  assert.equal(parseMembershipDate(now).getTime(), now);
  for (const input of ['20260230', '', null, {}, 'invalid']) assert.equal(parseMembershipDate(input), null);
});

test('无登录 cookie 不访问接口，当前及旧版 cookie 均兼容', async () => {
  let fetched = false;
  assert.deepEqual(await getAccountInfo({ cookies: { get: async () => null }, fetchImpl: async () => { fetched = true; } }), { status: 'signed-out' });
  assert.equal(fetched, false);
  for (const name of ['jwtToken', 'Jwt-Token', 'token']) {
    const result = await getAccountInfo({
      cookies: { get: async query => query.name === name ? { value: 'test-token' } : null },
      fetchImpl: async (url, options) => {
        assert.equal(url, 'https://api2.mubu.com/v3/api/user/profile');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['jwt-token'], 'test-token');
        return json({ code: 0, data: profile });
      }
    });
    assert.equal(result.status, 'signed-in');
  }
});

test('登录失效与网络/业务异常分开显示，错误中不泄露资料', async () => {
  for (const code of [2, 1209, 10007, 20001]) {
    assert.deepEqual(await getAccountInfo({ cookies, fetchImpl: async () => json({ code }) }), { status: 'signed-out' });
  }
  assert.equal((await getAccountInfo({ cookies, fetchImpl: async () => new Response('', { status: 401 }) })).status, 'signed-out');
  for (const fetchImpl of [
    async () => { throw new Error('secret'); },
    async () => json({ code: 18, msg: 'secret' }),
    async () => json({ code: 0, data: {} }),
    async () => new Response('invalid json'),
    async () => new Response('', { status: 503 })
  ]) assert.deepEqual(await getAccountInfo({ cookies, fetchImpl }), { status: 'unavailable' });
});

test('查询超时可恢复，并使用独立的取消信号', async () => {
  let signal;
  const result = await getAccountInfo({ cookies, timeoutMs: 10, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } });
  assert.deepEqual(result, { status: 'unavailable' });
  assert.equal(signal.aborted, true);
});
