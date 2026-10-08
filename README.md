# Propora

A production-grade **multi-tenant property management SaaS** backend built with NestJS, Prisma, PostgreSQL (Neon) and Supabase.

Propora lets property management companies run their portfolio: organizations, properties, buildings, units, residents, leases, rent collection (Stripe + invoices), maintenance, documents, notifications — with strict per-tenant isolation, full RBAC, audit logging, outgoing webhooks and transactional email.

## Features

- **Multi-tenancy** with automatic tenant isolation (AsyncLocalStorage) — every query is scoped to the caller's organization
- **JWT authentication**: short-lived access tokens + rotating opaque refresh tokens (hashed at rest, httpOnly cookie), refresh **reuse detection** (suspected theft revokes the whole token family), `tokenVersion` kills access tokens instantly on password change, strict cookie/body agreement on refresh
- **Platform admins** (separate credential store + login) and **platform users** (organization managers assigned to tenants)
- **Full RBAC**: permission catalog (53 permissions), system roles per organization, custom roles; platform admins bypass tenancy checks
- **Online payments (Strategy pattern)**: Stripe Checkout (test mode) with verified webhooks, plus a built-in Fake provider for offline end-to-end testing — one `markPaid` pipeline for webhook/fake/manual, idempotent replays
- **PDF invoices** auto-generated on every paid payment, stored in Supabase and linked as document rows, downloadable per payment
- **Transactional email** (Brevo + Pug templates): welcome, invite, receipt, maintenance assignment, security alerts — skipped gracefully without keys
- **Realtime notifications**: Supabase Realtime broadcast (works on Vercel serverless) + Socket.IO gateway for long-lived servers; same event contract for both
- **Audit log**: decorator-driven (`@Audit` / `@AuditEntity`) + explicit auth/billing trails, queryable per organization
- **Outgoing webhooks**: tenant endpoints with HMAC-SHA256 signatures, event subscriptions, delivery log, test pings, secret rotation
- **Supabase Storage**: upload/replace/delete kept in sync with rows, tenant-scoped paths, mimetype allowlist + size limits
- **Organization settings** (currency/timezone/language/logo/tax), **unit-type catalog**, resident↔user portal linking
- **Money as DECIMAL(10,2)** end-to-end (responses normalized to numbers by a global interceptor)
- **Security**: Helmet, custom rate limiting, hardened CORS (wildcard can never combine with credentials), env-driven cookie SameSite, bcrypt-12, global exception filter with Prisma error mapping
- **OpenAPI/Swagger** at `/docs`

## Tech stack

- NestJS 12 (TypeScript, ESM) · Prisma 6 · PostgreSQL (Neon)
- Supabase (Storage + Realtime) · Brevo (email) + Pug · Stripe · pdfkit · Socket.IO
- Vitest (unit + e2e), oxlint, Prettier · Deployed on Vercel

## Architecture

```
src/
  auth/            register, login, refresh (strict rotation), logout, me, change-password
  platform/        platform-admin login, organizations, plans, platform users
  rbac/            roles, permissions, permission cache
  organizations/   profile, members, settings (currency/timezone/…)
  unit-types/      global unit-type catalog
  users/           member invite (email), roles assignment
  properties/      properties, buildings, units (nested routes)
  residents/       residents CRUD, portal-account linking
  leases/          leases (overlap validation) + manual rent ledger
  billing/         Strategy providers (Stripe/Fake), checkout, webhooks, invoices (PDF)
  webhooks/        outgoing endpoints, HMAC dispatch, delivery log
  maintenance/     requests, assignment, status flow
  documents/       multipart upload (validated), replace, metadata, delete
  notifications/   in-app inbox + realtime fan-out
  reports/         financial and occupancy reports (org currency)
  audit/           @Audit/@AuditEntity interceptor + queryable log
  mail/            Brevo + Pug templates, event-driven sending
  realtime/        Supabase broadcast + Socket.IO (long-lived servers)
  storage/         Supabase client (storage + broadcast)
  common/          guards, decorators, interceptors, filters, events bus, DTOs, utils
  database/        PrismaService (slow-query log), TenantContextService
  config/          env validation, CORS policy
```

**Cross-cutting patterns**: global `ValidationPipe` (strict) · `AllExceptionsFilter` · `EventBus` (Observer: `payment.paid`, `maintenance.assigned`, `user.*` → mail/notify/webhooks) · Strategy (payments providers) + Factory (provider selection) · AOP via decorators/interceptors (tenancy, audit, request-id, logging, decimals).

**Tenant isolation**: `TenantContextInterceptor` stores the user in `AsyncLocalStorage`; services resolve `organizationId` from it. Platform admins (`isPlatformAdmin`) operate above tenancy.

## Prerequisites

- Node.js 22+
- PostgreSQL (Neon connection string)
- Supabase project (optional — storage/realtime degrade gracefully)
- Brevo API key (optional — emails are skipped with a warning without it)
- Stripe test keys (optional — Fake provider covers offline testing)

## Quick start

```bash
npm install
cp .env.example .env
# edit .env: DATABASE_URL, JWT_ACCESS_SECRET, SUPABASE_*, BREVO_*, STRIPE_* …

npx prisma migrate deploy   # apply migrations (or: npm run db:push)
npm run db:seed             # permissions, platform admin, unit types, demo org
npm run start:dev
```

The seed creates a platform admin (`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`, default `admin@propora.io` / `admin123456`), the permission catalog, unit types, and (unless `DEMO_ORGANIZATION=false`) a demo organization with sample data. The seed is idempotent — safe to re-run after upgrades to pick up new permissions.

## API

Base URL: `http://localhost:3000/api/v1` — interactive docs at `http://localhost:3000/docs`.

```bash
# register (returns accessToken + httpOnly refresh cookie)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"organizationName":"Acme","firstName":"Ahmed","lastName":"Monem","email":"a@acme.io","password":"Str0ng!Pass"}'

# login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@acme.io","password":"Str0ng!Pass"}'

# use the access token
curl http://localhost:3000/api/v1/properties -H "Authorization: Bearer <accessToken>"

# refresh (cookie transport; body fallback for mobile — both must agree if sent)
curl -X POST http://localhost:3000/api/v1/auth/refresh -c cookies.txt -b cookies.txt

# platform admin login
curl -X POST http://localhost:3000/api/v1/platform/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@propora.io","password":"admin123456"}'
```

### Online payments (test drive without Stripe keys)

`PAYMENTS_PROVIDER` defaults to `auto`: Stripe when `STRIPE_SECRET_KEY` is set, otherwise the Fake provider. Stripe **test mode is free and unlimited** — use test card `4242 4242 4242 4242`.

```bash
# 1. create a checkout session for a PENDING payment
curl -X POST http://localhost:3000/api/v1/payments/<paymentId>/checkout \
  -H "Authorization: Bearer <token>"
# → { checkoutUrl, provider }

# 2a. Stripe: open checkoutUrl, pay with 4242…, webhook marks it PAID
# 2b. Fake: open checkoutUrl (a confirm link) — same paid pipeline runs
# 3. download the auto-generated invoice
curl http://localhost:3000/api/v1/payments/<paymentId>/invoice \
  -H "Authorization: Bearer <token>" -o invoice.pdf
```

Stripe webhooks: `POST /api/v1/billing/stripe/webhook` (signature verified against the raw body; configure `STRIPE_WEBHOOK_SECRET` and point `stripe listen` or the dashboard at it).

### Outgoing webhooks

Register `POST /webhooks { url, events? }` → the secret is returned **once**. Deliveries are signed (`X-Propora-Signature: sha256=<hmac>`, plus `X-Propora-Event` / `X-Propora-Delivery`), logged per attempt (`GET /webhooks/:id/deliveries`), testable (`POST /webhooks/:id/test`) and rotatable (`POST /webhooks/:id/rotate-secret`).

### Realtime (frontend)

```ts
// Supabase Realtime (works on Vercel)
supabase.channel(`propora:org:<orgId>`)
  .on('broadcast', { event: '*' }, ({ event, payload }) => { /* … */ })
  .subscribe();

// Socket.IO (self-hosted backend with REALTIME_TRANSPORT=socketio)
socket.emit('join', orgId, console.log);
socket.on('notification.created', handler); // payment.paid, maintenance.assigned, …
```

### Permission catalog (53)

`platform:manage`, `organization:read|update`, `user:*`, `role:*`, `property:*`, `building:*`, `unit:*`, `resident:*`, `lease:*`, `payment:read|create|update|delete`, `maintenance:*|assign`, `document:*`, `notification:read|update`, `report:financial|occupancy`, `audit:read`, `webhook:read|create|update|delete`.

## Testing

```bash
npm run lint          # oxlint
npm run typecheck     # tsc
npm test              # unit tests (vitest)
DATABASE_URL="postgres://..." npm run test:e2e   # e2e (needs a migrated database)
```

## Deployment (Vercel)

- `vercel deploy` — `vercel.json` routes everything to `api/index.ts`, ships Swagger UI assets + mail templates via `includeFiles`
- Database: run migrations against Neon (`npx prisma migrate deploy` with the production `DATABASE_URL`), then `npm run db:seed` once per upgrade for new permissions/catalogs
- Set production env vars: `JWT_ACCESS_SECRET`, `CORS_ORIGIN` (dashboard origin — never `*` with cookies), `COOKIE_SAMESITE=none` for cross-origin cookies, `SUPABASE_*`, `BREVO_API_KEY`, `STRIPE_*`, `FRONTEND_URL`/`APP_PUBLIC_URL`

## Author

Ahmed Monem — [GitHub](https://github.com/AhmedMonem122)
