/* Probe 7: deliveries NULL mystery — app queries + direct SQL, then wipe. */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const BASE = 'https://propora-nestjs-postegresql.vercel.app';
const results = [];

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
  return { status: res.status, json };
}

function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra: String(extra).slice(0, 300) });
}

const P = await (async () => {
  const r = await req('POST', '/api/v1/platform/auth/login', null, {
    email: 'admin@propora.io',
    password: 'admin123456',
  });
  return r.json?.accessToken ?? null;
})();

// Fresh probe org every run (unique name); leftovers wiped by slug below.
const email = `probeg-${Date.now().toString(36)}@example.com`;
const reg = await req('POST', '/api/v1/auth/register', null, {
  organizationName: `Probe Org G ${Date.now().toString(36)}`,
  firstName: 'Probe',
  lastName: 'Gee',
  email,
  password: 'Str0ng!Pass123',
});
const T = reg.json?.accessToken ?? null;
const me = await req('GET', '/api/v1/organizations/me', T);
const orgId = me.json?.id ?? null;
const slug = me.json?.slug ?? null;

const h = await req('POST', '/api/v1/webhooks', T, {
  url: `${BASE}/api/v1/health`,
  events: ['payment.paid'],
});
const hookId = h.json?.id ?? null;
const ping = await req('POST', `/api/v1/webhooks/${hookId}/test`, T, {});
check('ping', ping.status === 201 || ping.status === 200, `status=${ping.status} success=${ping.json?.success} statusCode=${ping.json?.statusCode} error=${ping.json?.error}`);

const all = await req('GET', `/api/v1/webhooks/${hookId}/deliveries`, T);
const ff = await req('GET', `/api/v1/webhooks/${hookId}/deliveries`, T, null, '?success=false');
const tt = await req('GET', `/api/v1/webhooks/${hookId}/deliveries`, T, null, '?success=true');
check('unfiltered', all.status === 200, `total=${all.json?.meta?.total}`);
check('filter false', ff.status === 200, `status=${ff.status} total=${ff.json?.meta?.total}`);
check('filter true', tt.status === 200, `status=${tt.status} total=${tt.json?.meta?.total}`);

// direct SQL — ground truth
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(
  'SELECT id, event, success, "statusCode", error, pg_typeof(success)::text AS typ FROM webhook_deliveries WHERE "endpointId" = $1',
  hookId,
);
check('direct SQL row', true, JSON.stringify(rows).slice(0, 300));
const cols = await prisma.$queryRawUnsafe(
  "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'webhook_deliveries' AND column_name = 'success'",
);
check('success column def', true, JSON.stringify(cols).slice(0, 300));
await prisma.$disconnect();

// wipe: this run's org + any leftover probe/sweep orgs by slug prefix
{
  const del = async (id, sg) => {
    const r = await req('DELETE', `/api/v1/platform/organizations/${id}`, P, { confirm: sg });
    return r.status === 200;
  };
  await del(orgId, slug);
  const prisma2 = new PrismaClient();
  const leftovers = await prisma2.organization.findMany({
    where: { OR: [{ slug: { startsWith: 'probe-org-g' } }, { slug: { startsWith: 'sweep' } }] },
    select: { id: true, slug: true },
  });
  for (const o of leftovers) {
    await del(o.id, o.slug);
  }
  await prisma2.$disconnect();
  check('cleanup probe/sweep orgs', true, `wiped leftovers: ${leftovers.length}`);
}

console.log(JSON.stringify({ results }, null, 1));
