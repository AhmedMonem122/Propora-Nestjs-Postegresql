/* Sweep 3 (resilient rerun): leases, payments, billing, maintenance, documents, notifications, reports, settings, audit, webhooks, users. */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://propora-nestjs-postegresql.vercel.app';
const state = JSON.parse(readFileSync('sweep-state.json', 'utf8'));
const T = state.ownerToken;
const results = [];

async function req(method, path, token, body, query = '') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${BASE}${path}${query}`, {
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
    return { status: res.status, json };
  } catch (e) {
    return { status: -1, json: null };
  } finally {
    clearTimeout(timer);
  }
}

function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra: String(extra).slice(0, 160) });
}

function finish() {
  try {
    writeFileSync('sweep-state.json', JSON.stringify(state));
  } catch { /* ignore */ }
  console.log(JSON.stringify({ results }, null, 1));
}
process.on('uncaughtException', (e) => {
  results.push({ name: 'UNCAUGHT', ok: false, extra: String(e).slice(0, 200) });
  finish();
  process.exit(0);
});

// --- leases (reuse if present) ---
{
  const existing = await req('GET', '/api/v1/leases', T, null, `?unitId=${state.unitId}`);
  if (existing.json?.data?.length) {
    state.leaseId = existing.json.data[0].id;
    check('POST /leases (reused existing)', true, `id=${state.leaseId}`);
  } else {
    const r = await req('POST', '/api/v1/leases', T, {
      unitId: state.unitId,
      residentId: state.residentId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      rentAmount: 4500,
      depositAmount: 9000,
    });
    state.leaseId = r.json?.id ?? null;
    check('POST /leases', r.status === 201 && !!state.leaseId, `status=${r.status} ${JSON.stringify(r.json).slice(0,120)}`);
  }
}
const leaseId = state.leaseId;
{
  const r = await req('POST', '/api/v1/leases', T, {
    unitId: state.unitId,
    residentId: state.residentId,
    startDate: '2026-06-01',
    endDate: '2026-09-01',
    rentAmount: 4500,
  });
  check('POST overlapping lease -> 409', r.status === 409, `status=${r.status}`);
}
{
  const r = await req('GET', '/api/v1/leases', T, null, `?unitId=${state.unitId}&status=UPCOMING`);
  check('GET /leases filters', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}

// --- payments (reuse if present) ---
{
  const existing = await req('GET', '/api/v1/payments', T, null, `?leaseId=${leaseId}`);
  if (existing.json?.data?.length) {
    state.paymentId = existing.json.data[0].id;
    check('POST payment (reused existing)', true, `id=${state.paymentId} status=${existing.json.data[0].status}`);
  } else {
    const r = await req('POST', `/api/v1/leases/${leaseId}/payments`, T, {
      amount: 4500,
      currency: 'EGP',
      type: 'RENT',
      method: 'BANK_TRANSFER',
      dueDate: '2026-11-01',
    });
    state.paymentId = r.json?.id ?? null;
    check('POST payment (type=RENT)', r.status === 201 && !!state.paymentId, `status=${r.status} ${JSON.stringify(r.json).slice(0,120)}`);
  }
}
const paymentId = state.paymentId;
{
  const r = await req('GET', '/api/v1/payments', T, null, `?leaseId=${leaseId}&status=PENDING&type=RENT`);
  check('GET /payments filters+type', r.status === 200, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('POST', `/api/v1/payments/${paymentId}/checkout`, T, {});
  state.checkoutUrl = r.json?.checkoutUrl ?? null;
  const alreadyPaid = r.status === 409;
  check('POST checkout (fake provider)', (r.status === 201 && !!state.checkoutUrl) || alreadyPaid, `status=${r.status} provider=${r.json?.provider}`);
}
if (state.checkoutUrl) {
  try {
    const url = new URL(state.checkoutUrl);
    const r = await req('GET', url.pathname, null);
    check('GET fake confirm -> PAID', r.status === 200 && r.json?.status === 'PAID', `status=${r.status}`);
  } catch (e) {
    check('GET fake confirm -> PAID', false, `bad url: ${state.checkoutUrl}`);
  }
} else {
  const cur = await req('GET', `/api/v1/payments/${paymentId}`, T);
  check('GET fake confirm -> PAID', cur.json?.status === 'PAID', `already-paid status=${cur.json?.status}`);
}
{
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let status = -1;
  let isPdf = false;
  let len = 0;
  try {
    const res = await fetch(`${BASE}/api/v1/payments/${paymentId}/invoice`, {
      headers: { authorization: `Bearer ${T}` },
      signal: controller.signal,
    });
    status = res.status;
    const buf = Buffer.from(await res.arrayBuffer());
    len = buf.length;
    isPdf = buf.subarray(0, 4).toString() === '%PDF';
  } catch { /* ignore */ }
  clearTimeout(timer);
  check('GET invoice PDF', status === 200 && isPdf, `bytes=${len}`);
}
{
  const r = await req('GET', `/api/v1/payments/${paymentId}`, T);
  check('invoiceNo assigned', r.status === 200 && /^INV-\d{4}-/.test(r.json?.invoiceNo ?? ''), `invoiceNo=${r.json?.invoiceNo}`);
}

// --- maintenance (reuse if present) ---
{
  const existing = await req('GET', '/api/v1/maintenance/requests', T, null, `?unitId=${state.unitId}`);
  if (existing.json?.data?.length) {
    state.maintId = existing.json.data[0].id;
    check('POST maintenance (reused existing)', true, `id=${state.maintId} status=${existing.json.data[0].status}`);
  } else {
    const r = await req('POST', '/api/v1/maintenance/requests', T, {
      unitId: state.unitId,
      residentId: state.residentId,
      title: 'Sweep: leaky faucet',
      description: 'drips at night',
      priority: 'HIGH',
    });
    state.maintId = r.json?.id ?? null;
    check('POST maintenance', r.status === 201 && !!state.maintId, `status=${r.status}`);
  }
}
const maintId = state.maintId;
{
  const r = await req('GET', '/api/v1/maintenance/requests', T, null, `?unitId=${state.unitId}&priority=HIGH`);
  check('GET maintenance filters', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}
{
  const roles = await req('GET', '/api/v1/roles', T);
  const staffRole = (roles.json ?? []).find((x) => x.name === 'STAFF');
  state.staffRoleId = staffRole?.id ?? null;
  const staffList = await req('GET', '/api/v1/users', T, null, '?search=sweep-staff');
  if (staffList.json?.data?.length) {
    state.staffId = staffList.json.data[0].id;
    state.staffEmail = staffList.json.data[0].email;
    check('POST /users invite staff (reused)', true, `id=${state.staffId}`);
  } else {
    const email = `sweep-staff-${Date.now().toString(36)}@example.com`;
    const inv = await req('POST', '/api/v1/users', T, {
      email,
      password: 'TempStr0ng!Pass1',
      firstName: 'Sweep',
      lastName: 'Staff',
      roleIds: staffRole?.id ? [staffRole.id] : [],
    });
    state.staffId = inv.json?.id ?? null;
    state.staffEmail = email;
    check('POST /users invite staff', inv.status === 201 && !!state.staffId, `status=${inv.status}`);
  }
}
{
  const r = await req('POST', `/api/v1/maintenance/requests/${maintId}/assign`, T, { assignedToId: state.staffId });
  check('POST assign (+notification+mail events)', r.status === 201 || r.status === 200, `status=${r.status}`);
}
{
  const cur = await req('GET', '/api/v1/maintenance/requests', T, null, `?unitId=${state.unitId}`);
  const current = cur.json?.data?.[0]?.status;
  const target = current === 'RESOLVED' ? 'CLOSED' : 'RESOLVED';
  const r = await req('PATCH', `/api/v1/maintenance/requests/${maintId}/status`, T, { status: target });
  check(`PATCH maintenance status -> ${target}`, r.status === 200, `status=${r.status} was=${current}`);
}

// --- documents ---
{
  const r = await req('POST', '/api/v1/documents', T, {
    entityType: 'lease',
    entityId: leaseId,
    name: 'sweep-lease-ref.txt',
    url: 'https://example.com/sweep.txt',
    category: 'LEASE',
  });
  check('POST document by URL', r.status === 201 && !!r.json?.id, `status=${r.status}`);
}
{
  const form = new FormData();
  form.append('file', new Blob(['sweep file contents'], { type: 'text/plain' }), 'sweep.txt');
  form.append('entityType', 'property');
  form.append('entityId', state.propId);
  form.append('name', 'sweep-upload.txt');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let status = -1;
  try {
    const res = await fetch(`${BASE}/api/v1/documents/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${T}` },
      body: form,
      signal: controller.signal,
    });
    status = res.status;
  } catch { /* ignore */ }
  clearTimeout(timer);
  check('POST documents/upload (supabase)', status === 201, `status=${status}`);
}
{
  const r = await req('GET', '/api/v1/documents', T, null, '?search=sweep');
  check('GET /documents search', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}

// --- notifications / reports / settings / audit ---
{
  const r = await req('GET', '/api/v1/notifications', T, null, '?unreadOnly=true');
  check('GET notifications unreadOnly=true', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('GET', '/api/v1/notifications', T, null, '?unreadOnly=false');
  check('GET notifications unreadOnly=false (all)', r.status === 200, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('GET', '/api/v1/reports/financial', T);
  check('GET reports/financial', r.status === 200 && !!r.json?.period, `currency=${r.json?.period?.currency}`);
}
{
  const r = await req('GET', '/api/v1/reports/occupancy', T);
  check('GET reports/occupancy', r.status === 200, `status=${r.status}`);
}
{
  const p = await req('PATCH', '/api/v1/organizations/me/settings', T, { currency: 'EGP' });
  const f = await req('GET', '/api/v1/reports/financial', T);
  check('settings currency -> reports', p.status === 200 && f.json?.period?.currency === 'EGP', `currency=${f.json?.period?.currency}`);
}
{
  const r = await req('GET', '/api/v1/audit-logs', T, null, '?action=payment.paid');
  check('GET /audit-logs filtered', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}

// --- webhooks out ---
{
  const r = await req('POST', '/api/v1/webhooks', T, {
    url: `${BASE}/api/v1/health`,
    events: ['payment.paid'],
  });
  state.hookId = r.json?.id ?? null;
  const hasSecret = !!(r.json?.secret && r.json.secret.length >= 32);
  check('POST /webhooks (secret once)', r.status === 201 && !!state.hookId && hasSecret, `status=${r.status}`);
}
{
  const r = await req('POST', `/api/v1/webhooks/${state.hookId}/test`, T, {});
  check('POST webhook test ping', (r.status === 201 || r.status === 200) && r.json?.event === 'ping', `status=${r.status}`);
}
{
  const r = await req('GET', `/api/v1/webhooks/${state.hookId}/deliveries`, T, null, '?success=false');
  check('GET deliveries success=false', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}

// --- users / RBAC / resident link / validation ---
{
  const login = await req('POST', '/api/v1/auth/login', null, {
    email: state.staffEmail,
    password: 'TempStr0ng!Pass1',
  });
  state.staffToken = login.json?.accessToken ?? null;
  const forbidden = await req('POST', '/api/v1/properties', state.staffToken, { name: 'nope' });
  check('RBAC: staff POST /properties -> 403', forbidden.status === 403, `status=${forbidden.status}`);
}
{
  const staffList = await req('GET', '/api/v1/users', T, null, '?search=sweep-staff');
  const staffUserId = staffList.json?.data?.[0]?.id;
  const r = await req('PATCH', `/api/v1/residents/${state.residentId}`, T, { userId: staffUserId });
  check('PATCH resident link user', r.status === 200, `status=${r.status}`);
}
{
  const r = await req('POST', '/api/v1/properties', T, {});
  check('POST /properties empty body -> 400', r.status === 400, `status=${r.status}`);
}
{
  const r = await req('GET', '/api/v1/units/does-not-exist', T);
  check('GET missing unit -> 404', r.status === 404, `status=${r.status}`);
}

finish();
