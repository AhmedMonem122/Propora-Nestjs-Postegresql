/* Probe: staff login 401 + deliveries row inspection. */
import { readFileSync } from 'node:fs';

const BASE = 'https://propora-nestjs-postegresql.vercel.app';
const state = JSON.parse(readFileSync('sweep-state.json', 'utf8'));

async function req(method, path, token, body, query = '') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}${query}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 300) };
}

console.log('staffEmail =', state.staffEmail);
// 1. staff login — full error body
{
  const r = await req('POST', '/api/v1/auth/login', null, {
    email: state.staffEmail,
    password: 'TempStr0ng!Pass1',
  });
  console.log('staff login:', r.status, JSON.stringify(r.json));
}
// 2. deliveries without filter — inspect the ping row
{
  const hooks = await req('GET', '/api/v1/webhooks', state.ownerToken);
  console.log('webhooks:', (hooks.json ?? []).length);
  const hookId = state.hookId ?? hooks.json?.[0]?.id;
  const r = await req('GET', `/api/v1/webhooks/${hookId}/deliveries`, state.ownerToken);
  console.log('deliveries total:', r.json?.meta?.total, JSON.stringify((r.json?.data ?? []).slice(0, 2)));
}
// 3. full-datetime lease — isolates the @Type/IsDateString theory
{
  const r = await req('POST', '/api/v1/leases', state.ownerToken, {
    unitId: state.unitId,
    residentId: state.residentId,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
    rentAmount: 4500,
  });
  console.log('full-datetime lease:', r.status, (r.text ?? '').slice(0, 200));
}
