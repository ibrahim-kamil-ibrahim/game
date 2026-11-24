#!/usr/bin/env node
/*
 * Read-only production smoke test.
 *
 * Usage:
 *   SMOKE_ADMIN_USERNAME=admin \
 *   SMOKE_ADMIN_PASSWORD='...' \
 *   node scripts/production-smoke.mjs https://your-service.onrender.com
 *
 * Optional: SMOKE_ADMIN_ORIGIN=https://your-admin-site.onrender.com to also
 * assert the CORS preflight and cookie flags used by the admin web app.
 *
 * The password is read from the environment and is never printed.
 */

const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const username = process.env.SMOKE_ADMIN_USERNAME || 'admin';
const password = process.env.SMOKE_ADMIN_PASSWORD || '';
const adminOrigin = (process.env.SMOKE_ADMIN_ORIGIN || '').replace(/\/$/, '');
const api = `${baseUrl}/api/v1`;

if (!baseUrl.startsWith('https://')) {
  console.error('Provide the production HTTPS base URL as the first argument.');
  process.exit(2);
}
if (!password) {
  console.error('SMOKE_ADMIN_PASSWORD is required.');
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function request(path, options = {}) {
  const response = await fetch(path.startsWith('http') ? path : `${api}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { response, body };
}

const health = await request(`${baseUrl}/health`);
check('health endpoint returns 200', health.response.status === 200, `status=${health.response.status}`);
check('health reports database ok', health.body?.status === 'ok');

let preflightOk = null;
if (adminOrigin) {
  const pre = await fetch(`${api}/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: adminOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  const allowOrigin = pre.headers.get('access-control-allow-origin');
  const allowCredentials = pre.headers.get('access-control-allow-credentials');
  preflightOk = allowOrigin === adminOrigin && allowCredentials === 'true';
  check('CORS preflight allows the admin origin', preflightOk, `allow-origin=${allowOrigin ?? 'none'}`);
}

const login = await request('/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-client-type': 'mobile', ...(adminOrigin ? { origin: adminOrigin } : {}) },
  body: JSON.stringify({ username, password }),
});
check('admin login succeeds', login.response.status === 200 && login.body?.success === true, `status=${login.response.status}`);

const accessToken = login.body?.data?.accessToken;
const refreshToken = login.body?.data?.refreshToken;
check('login returns access token', typeof accessToken === 'string' && accessToken.length > 20);
check('mobile login returns refresh token', typeof refreshToken === 'string' && refreshToken.length > 20);

if (adminOrigin) {
  const setCookie = login.response.headers.get('set-cookie') || '';
  check('refresh cookie is HttpOnly', /HttpOnly/i.test(setCookie));
  check('refresh cookie is SameSite=None', /SameSite=None/i.test(setCookie));
  check('refresh cookie is Secure', /Secure/i.test(setCookie));
}

const authHeaders = { authorization: `Bearer ${accessToken}` };

const me = await request('/auth/me', { headers: authHeaders });
check('authenticated /auth/me works', me.response.status === 200 && me.body?.data?.user?.username === username);

for (const [label, path] of [
  ['machines', '/machines'],
  ['categories', '/categories'],
  ['packages', '/packages'],
  ['settings', '/settings'],
  ['admin dashboard', '/admin/dashboard'],
]) {
  const res = await request(path, { headers: authHeaders });
  check(`${label} endpoint returns 200`, res.response.status === 200, `status=${res.response.status}`);
}

if (refreshToken) {
  const refreshed = await request('/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-type': 'mobile' },
    body: JSON.stringify({ refreshToken }),
  });
  check('refresh token rotates', refreshed.response.status === 200 && typeof refreshed.body?.data?.refreshToken === 'string');

  const rotated = refreshed.body?.data?.refreshToken;
  if (rotated) {
    const logout = await request('/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-type': 'mobile' },
      body: JSON.stringify({ refreshToken: rotated }),
    });
    check('logout succeeds', logout.response.status === 200);
  }
}

console.log(failures === 0 ? '\nAll production smoke checks passed.' : `\n${failures} production smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
