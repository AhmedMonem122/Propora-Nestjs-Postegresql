/* Sweep 2: properties, buildings, units, residents CRUD + filters. */
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

// --- properties ---
let propId;
{
  const r = await req('POST', '/api/v1/properties', T, {
    name: 'Sweep Tower Complex',
    type: 'RESIDENTIAL',
    city: 'Cairo',
    country: 'Egypt',
    description: 'sweep test',
  });
  propId = r.json?.id;
  check('POST /properties', r.status === 201 && !!propId, `status=${r.status}`);
  state.propId = propId;
}
{
  const r = await req('GET', '/api/v1/properties', T, null, '?search=Sweep&city=Cairo&type=RESIDENTIAL');
  check('GET /properties filters', r.status === 200 && r.json?.data?.length >= 1, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('GET', '/api/v1/properties', T, null, '?page=abc');
  check('GET /properties invalid page -> 400', r.status === 400, `status=${r.status}`);
}
{
  const r = await req('PATCH', `/api/v1/properties/${propId}`, T, { description: 'updated desc' });
  check('PATCH /properties/:id', r.status === 200 && r.json?.description === 'updated desc', `status=${r.status}`);
}

// --- buildings (paginated now) ---
let buildingId;
{
  const r = await req('POST', `/api/v1/properties/${propId}/buildings`, T, {
    name: 'Sweep Tower A',
    code: 'STA',
    totalFloors: 5,
    address: '1 Sweep St',
  });
  buildingId = r.json?.id;
  check('POST building', r.status === 201 && !!buildingId, `status=${r.status}`);
  state.buildingId = buildingId;
}
{
  const r = await req('GET', `/api/v1/properties/${propId}/buildings`, T, null, '?search=STA&page=1&limit=5');
  const paged = r.json?.meta && typeof r.json.meta.total === 'number';
  check('GET buildings paginated+search', r.status === 200 && paged && r.json.data.length >= 1, `total=${r.json?.meta?.total}`);
}

// --- unit types + units ---
let unitId;
{
  const r = await req('GET', '/api/v1/unit-types', T);
  const twoBR = (r.json ?? []).find((u) => u.name === '2BR');
  state.unitTypeId = twoBR?.id ?? null;
  check('GET /unit-types catalog', r.status === 200 && Array.isArray(r.json) && r.json.length >= 8, `count=${r.json?.length}`);
}
{
  const r = await req('POST', `/api/v1/buildings/${buildingId}/units`, T, {
    name: 'A-101',
    unitNumber: '101',
    bedrooms: 2,
    bathrooms: 1.5,
    rentAmount: 4500,
    depositAmount: 9000,
    unitTypeId: state.unitTypeId,
  });
  unitId = r.json?.id;
  check('POST unit (decimal money + unitType)', r.status === 201 && !!unitId, `status=${r.status}`);
  state.unitId = unitId;
}
{
  const r = await req('GET', `/api/v1/buildings/${buildingId}/units`, T, null, '?search=101&status=VACANT');
  check('GET units by building (paged+filters)', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('GET', `/api/v1/properties/${propId}/units`, T, null, '?status=VACANT');
  check('GET units by property', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('GET', `/api/v1/units/${unitId}`, T);
  const amountType = typeof r.json?.rentAmount;
  check('GET unit (unitType included, amount is number)', r.status === 200 && !!r.json?.unitType && amountType === 'number', `rentAmount:${amountType}=${r.json?.rentAmount}`);
}
{
  const r = await req('POST', `/api/v1/buildings/${buildingId}/units`, T, { name: 'BAD', unitTypeId: 'nope' });
  check('POST unit bad unitType -> 404', r.status === 404, `status=${r.status}`);
}

// --- residents ---
let residentId;
{
  const r = await req('POST', '/api/v1/residents', T, {
    firstName: 'Sweep',
    lastName: 'Resident',
    email: 'sweep.resident@example.com',
    idNumber: 'ID-1',
  });
  residentId = r.json?.id;
  check('POST /residents', r.status === 201 && !!residentId, `status=${r.status}`);
  state.residentId = residentId;
}
{
  const r = await req('GET', '/api/v1/residents', T, null, '?search=sweep&status=ACTIVE');
  check('GET /residents search+status', r.status === 200 && r.json?.meta?.total >= 1, `total=${r.json?.meta?.total}`);
}
{
  const r = await req('GET', `/api/v1/residents/${residentId}`, T);
  check('GET /residents/:id', r.status === 200 && r.json?.id === residentId, `status=${r.status}`);
}

writeFileSync('sweep-state.json', JSON.stringify(state));
console.log(JSON.stringify({ results }, null, 1));
