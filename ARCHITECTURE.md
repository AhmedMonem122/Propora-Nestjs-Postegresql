# Propora — Architecture Notes

How the backend is put together and why. For the feature tour see README.md.

## Tenancy

- Shared database, shared schema, `organizationId` on every tenant row.
- `TenantContextInterceptor` stores `{ userId, organizationId }` in
  `AsyncLocalStorage` per request; services resolve it via
  `TenantContextService.requireOrganizationId()`. There is no way to query
  across tenants by accident — the scope is applied in every `where`.
- Platform admins (`isPlatformAdmin` JWT flag) operate above tenancy and
  bypass `PermissionsGuard`. The legacy seeded super-admin (a normal `User`
  with `platform:manage`) keeps working through RBAC.

## Auth

- Access: JWT 15m (`sub`, `organizationId`, `tokenVersion`,
  `platformAdminId?`). `tokenVersion` is bumped on password change /
  reuse detection, killing outstanding access tokens immediately.
- Refresh: opaque 256-bit tokens, SHA-256 at rest, single-use rotation.
  Presenting an already-rotated token = suspected theft → the whole token
  family is revoked + version bumped (OAuth reuse detection).
- Cookie (`httpOnly`, `SameSite` env-driven) is primary for browsers; the
  same value is returned in the JSON body for mobile/CLI/Swagger.
- Refresh transport rule: cookie and body MUST agree when both are sent.
  A JWT-shaped value is rejected with a dedicated error.
- Password reset: 6-digit OTP, hashed at rest, 10-minute TTL, single
  active code per user, attempt cap, constant-time compare, generic
  responses (no account enumeration). Reset logs the user in directly.

## Domain events (best-effort)

- `EventBus` (in-process Observer): `payment.paid`,
  `maintenance.assigned`, `user.*` → mail, notifications, webhooks,
  realtime. Handlers are isolated (`allSettled` + try/catch): observability
  and engagement features can never fail a business request.
- Deliberately NOT a durable outbox (yet): serverless functions have no
  background relay. Critical money-trail writes (payment row, invoice,
  notification row, audit row) happen INLINE in the request; only
  notification-delivery (mail/push/webhooks) is best-effort. If at-least-
  once delivery becomes a requirement, add an `outbox` table + a
  Vercel-Cron relay — the listener seam already exists.

## Money

- `DECIMAL(10,2)` columns; a global `DecimalInterceptor` serializes them
  to JSON numbers so clients never parse strings. Invoice numbers are
  deterministic (`INV-<year>-<paymentId suffix>`) → regenerations and
  webhook replays are idempotent.
- Online payments follow Strategy + Factory (`PaymentsProvider`):
  Stripe Checkout (idempotency keys, verified webhooks) or the Fake
  provider (stateless confirm links exercising the real pipeline).
  Every paid path funnels through one idempotent `markPaid`.

## Realtime on serverless

- Socket.IO needs sticky, long-lived connections — Vercel functions
  provide neither. So the default transport is **Supabase Realtime
  broadcast** (outbound HTTPS, works everywhere); a Socket.IO gateway
  attaches only on long-lived servers (`REALTIME_TRANSPORT=socketio`).
  Same event names/payloads on both — one frontend client works either way.

## Rate limiting

- Two independent buckets per IP: `auth:*` (10/min) and `api:*`
  (100/min). Sharing one counter locked users out of login after normal
  browsing — a real production bug this design fixed.
- `RateLimitStore` abstraction: in-memory by default, Upstash Redis REST
  when configured (shared across instances, no persistent connection).
  Redis outages fail open (availability over strictness).

## Files

- Tenant-scoped paths `<org>/<entity>/<id>/<uuid>-<name>`, replace =
  same-path upsert, delete removes storage first. 5 MB cap + mimetype
  allowlist at the interceptor.
- Server-side storage prefers `SUPABASE_SERVICE_KEY` (RLS bypass for
  bucket admin/uploads/deletes). Anon key works only with matching
  storage policies — the classic "upload 400 RLS" cause.

## Webhooks

- Incoming (Stripe): raw-body preserved for signature verification
  (registered ahead of `express.json()` in both bootstraps).
- Outgoing: tenant endpoints, HMAC-SHA256 (`sha256=<hex>`), event
  subscriptions (empty = all), per-attempt delivery log, test pings,
  secret rotation (revealed once, never listed).

## Ops

- Migrations are additive and transaction-safe (hand-fixed enum dance:
  `ADD VALUE` cannot run inside `migrate deploy`'s transaction).
  `db:seed` is idempotent — safe to re-run per upgrade for catalogs.
- Slow-query log (>500 ms, env-tunable). JSON-friendly request logging
  with request ids. Health checks DB. Graceful Prisma disconnect.
- ERD deviations (conscious): join tables keep composite PKs + gained
  timestamps; `User.organizationId` stays nullable for platform legacy;
  `Unit.type` kept alongside `unitTypeId` for back-compat.

## Testing

- 90+ unit tests (vitest): services with mocked Prisma, guards,
  interceptors, providers, utils. Full `npm test` in CI.
- E2E (`test:e2e`, supertest, postgres service in CI): register →
  isolation → RBAC 403 → invalid token.
- Live sweeps: scripted fetch suites run against the Vercel deployment
  (CRUD, filters, billing, invoices, webhooks, isolation) with org wipe
  cleanup — see git history for the routine.
