# Propora

A production-grade **multi-tenant property management SaaS** backend built with NestJS, Prisma, PostgreSQL (Neon) and Supabase Storage.

Propora lets property management companies manage their portfolio: organizations, properties, buildings, units, residents, leases, rent payments, maintenance requests and documents — with strict per-tenant data isolation and a full role-based access control (RBAC) system.

## Features

- **Multi-tenancy** with automatic tenant isolation (AsyncLocalStorage) — every query is scoped to the caller's organization
- **JWT authentication** with access + refresh token rotation (opaque refresh tokens, hashed at rest, httpOnly cookie)
- **Full RBAC**: permission catalog (45 permissions), system roles per organization, custom roles with granular permission assignment
- **Platform admin** (super admin) that manages organizations and their status across the whole platform
- **Domain modules**: properties, buildings, units, residents, leases (with overlap validation), payments (overdue tracking), maintenance (assignment, status flow, notifications), documents
- **Supabase Storage integration**: file upload/replace/delete kept in sync with database rows, tenant-scoped storage paths
- **Reports**: financial summaries and occupancy rates per property
- **Security**: Helmet, rate limiting (Throttler), CORS, body size limits, bcrypt password hashing, centralized exception filter
- **OpenAPI/Swagger** documentation served at `/docs`

## Tech stack

- NestJS 12 (TypeScript, ESM)
- Prisma 6 + PostgreSQL (Neon serverless)
- Supabase Storage (file upload)
- Passport + JWT, bcryptjs
- Vitest (unit + e2e), oxlint, Prettier
- Deployed on Vercel

## Architecture

```
src/
  auth/            register, login, refresh, logout, me, change-password
  rbac/            roles, permissions, permission cache
  organizations/   organization profile and members
  users/           member invite, roles assignment, activation
  properties/      properties, buildings, units (nested routes)
  residents/       residents CRUD and search
  leases/          leases (overlap validation) + rent payments
  maintenance/     requests, assignment, status flow
  documents/       multipart upload, replace, metadata, delete
  notifications/   in-app notifications
  reports/         financial and occupancy reports
  platform/        super-admin organization management
  storage/         Supabase storage client
  common/          guards, decorators, interceptors, filters, DTOs, utils
  database/        PrismaService, TenantContextService (AsyncLocalStorage)
  config/          env validation and typed ConfigModule
```

**Tenant isolation**: `TenantContextInterceptor` stores the authenticated user in an `AsyncLocalStorage` context. Every service resolves `organizationId` from that context and applies it to all queries — a user can never read or write another organization's data.

**RBAC**: `@RequirePermissions('lease:create')` and `@RequireAnyPermission([...])` decorators drive the `PermissionsGuard`. Permissions are cached per user for 30s and invalidated on role/permission changes. Organization owners implicitly hold `*` (all permissions).

## Prerequisites

- Node.js 22+
- A Neon (or any) PostgreSQL connection string
- A Supabase project (optional — documents module degrades gracefully if not configured)

## Quick start

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL (Neon), JWT_ACCESS_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY

npm run db:push        # push schema to the database
npm run db:seed        # seed permissions, super admin + demo organization
npm run start:dev
```

The seed script creates:

- Super admin (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`, default `admin@propora.io` / `admin123456`) with the platform-level `PLATFORM_ADMIN` role
- A demo organization `Demo Property Group` (owner `owner@demo.propora.io` / `demo123456`) with sample property, buildings, units, residents, active lease, payments, maintenance request and documents

## API

Base URL: `http://localhost:3000/api/v1` — interactive docs at `http://localhost:3000/docs`.

```bash
# register a new organization (returns accessToken + httpOnly refresh cookie)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"organizationName":"Acme Properties","firstName":"Ahmed","lastName":"Monem","email":"a@acme.io","password":"Str0ng!Pass"}'

# login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@acme.io","password":"Str0ng!Pass"}'

# use the access token
curl http://localhost:3000/api/v1/properties -H "Authorization: Bearer <accessToken>"

# refresh the access token (rotation)
curl -X POST http://localhost:3000/api/v1/auth/refresh -c cookies.txt -b cookies.txt
```

### Permission catalog (examples)

`property:read|create|update|delete`, `unit:*`, `resident:*`, `lease:*`, `payment:read|create|update`, `maintenance:read|create|update|assign|delete`, `document:read|create|update|delete`, `report:financial|occupancy`, `organization:read|update`, `user:read|create|update|delete`, `role:read|create|update|delete`, `platform:manage`

### File upload

```bash
curl -X POST http://localhost:3000/api/v1/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@lease.pdf" -F "entityType=lease" -F "entityId=<leaseId>" -F "title=Lease contract"
```

Files are uploaded to Supabase under a tenant-scoped path (`<orgId>/<entityType>/<entityId>/<uuid>-<name>`). Replacing a document overwrites the same storage path; deleting a document removes the file from Supabase first, then the row.

## Testing

```bash
npm run lint          # oxlint
npm run typecheck     # tsc
npm test              # 44 unit tests (vitest)
DATABASE_URL="postgres://..." npm run test:e2e   # e2e suite (needs a real database)
```

The e2e suite boots the full application and verifies registration, tenant isolation between organizations, RBAC 403s and auth failures.

## Deployment

- **Vercel**: `vercel deploy` (see `vercel.json` — build outputs `dist`, start command `node dist/main.js`)
- **Database**: Neon serverless Postgres (connection pooling friendly)
- **Storage**: Supabase bucket `documents` (auto-created on boot when credentials are provided)

## Roadmap

- Webhooks + email notifications (Resend)
- Audit log
- Invoice generation (PDF)
- Frontend dashboard (Next.js)

## Author

Ahmed Monem — [GitHub](https://github.com/AhmedMonem122)
