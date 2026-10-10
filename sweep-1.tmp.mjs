/* Sweep 1: setup — platform login attempt, sweep org + isolation org. */
import { writeFileSync } from 'node:fs';

const BASE = 'https://propora-nestjs-postegresql.vercel.app';
const results = [];
const state = {};

async function req(method, path, token, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-json */
    }
    return { status: res.status, json, text: text.slice(0, 200) };
  } catch (e) {
    return { status: -1, json: null, text: String(e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra: String(extra).slice(0, 160) });
}

// 1. platform login (documented default creds, single attempt)
{
  const r = await req('POST', '/api/v1/platform/auth/login', null, {
    email: 'admin@propora.io',
    password: 'admin123456',
  });
  state.platformToken = r.status === 201 || r.status === 200 ? r.json?.accessToken ?? null : null;
  check('platform login (default creds)', !!state.platformToken, `status=${r.status}`);
}

// 2. sweep org
{
  const stamp = Date.now().toString(36);
  const email = `sweep-${stamp}@example.com`;
  const r = await req('POST', '/api/v1/auth/register', null, {
    organizationName: 'Sweep Org',
    firstName: 'Sweep',
    lastName: 'Runner',
    email,
    password: 'Str0ng!Pass123',
  });
  state.ownerToken = r.json?.accessToken ?? null;
  state.orgId = r.json?.user?.organizationId ?? r.json?.user?.organization?.id ?? null;
  state.email = email;
  check('register sweep org', r.status === 201 && !!state.ownerToken, `status=${r.status}`);
}

// 3. org slug (for later wipe) via me
{
  const r = await req('GET', '/api/v1/organizations/me', state.ownerToken);
  state.slug = r.json?.slug ?? null;
  state.orgId = state.orgId ?? r.json?.id ?? null;
  check('get own org (slug for wipe)', r.status === 200 && !!state.slug, `slug=${state.slug}`);
}

// 4. isolation org B
{
  const email = `sweepb-${Date.now().toString(36)}@example.com`;
  const r = await req('POST', '/api/v1/auth/register', null, {
    organizationName: 'Sweep Org B',
    firstName: 'Sweep',
    lastName: 'Bee',
    email,
    password: 'Str0ng!Pass123',
  });
  state.tokenB = r.json?.accessToken ?? null;
  const me = await req('GET', '/api/v1/organizations/me', state.tokenB);
  state.orgBId = me.json?.id ?? null;
  state.slugB = me.json?.slug ?? null;
  check('register isolation org B', !!state.tokenB, `status=${r.status}`);
}

writeFileSync('sweep-state.json', JSON.stringify(state));
console.log(JSON.stringify({ results, stateKeys: Object.keys(state) }, null, 1));
