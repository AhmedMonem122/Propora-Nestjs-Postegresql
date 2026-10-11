# Propora — Frontend Handoff (Next.js Dashboard + Marketing Site)

> Copy this file into the new frontend repo as `HANDOFF.md` (or paste it as the
> first message of the frontend session). Everything the implementer needs is here.
> **Backend is frozen.** Live base URL: `https://propora-nestjs-postegresql.vercel.app`
> Swagger (the API contract — read it first): `https://propora-nestjs-postegresql.vercel.app/docs`
> Raw OpenAPI JSON: `https://propora-nestjs-postegresql.vercel.app/docs-json`

---

## 1. What to build

A senior-level **Next.js 16 (latest stable at scaffold time — verify with docs)**
**TypeScript + Tailwind CSS + shadcn + Lucide** app with two surfaces:

- **Marketing (public, SEO-first, Server Components):** Home, Services, About Us,
  Contact Us. Expressive, impressive, animated — the recruiter showcase.
- **Dashboard (private, interactive):** full tenant operations — properties →
  buildings → units → residents → leases → payments/billing → maintenance →
  documents → notifications → reports → settings → users/roles → audit log →
  webhooks. Every table: **server search + server pagination + reload button**.
- **Out of scope (phase 2):** platform/super-admin section (`/platform/*`
  endpoints exist and are documented — build only if time allows).

## 2. Locked stack (do not swap)

| Choice | Decision |
|---|---|
| Framework | Next.js 16 App Router, TypeScript strict, Turbopack (default) |
| Styling | Tailwind CSS (+ CSS Modules **only** colocated when truly needed, see §4) |
| UI primitives | shadcn (new-york style). Never hand-edit `components/ui` except theme tokens |
| Icons | `lucide-react`. Only if a brand icon is missing, add `react-icons`. No Font Awesome |
| Data | **TanStack Query everywhere** (no ad-hoc `fetch` in components), **axios** instance (§7) |
| Forms | **React Hook Form + zod** (`zodResolver`), schema file colocated with the form |
| Tables | Generic `DataTable` built on **TanStack Table** (server search/pagination/sort) |
| Toasts | **Sonner** (shadcn `Toaster` in root layout). No react-hot-toast |
| Delete confirm | shadcn `AlertDialog` ("Are you sure?" → Delete / Cancel) — every destructive action |
| Charts | **Recharts** (rent-collected bars, occupancy donut on overview; dynamic-imported) |
| Dates | **date-fns** (formatting, due-date badges, ranges). No moment/dayjs |
| Money inputs | **react-number-format** (`NumericFormat`) for rent/deposit fields |
| Phone inputs | `react-phone-number-input` (EG numbers default) — optional but recommended |
| i18n | **next-intl** (App Router native). Ship EN first; message files ready, Arabic/RTL stretch later |
| Theme | **next-themes** (dark mode toggle from day one — recruiters check it) |
| Monitoring | **@sentry/nextjs** (free tier, tunnel) — recommended, not mandatory |
| Analytics | **@vercel/analytics + @vercel/speed-insights** (free, real perf proof) |
| Loading | Route `loading.tsx` + `Suspense` + **shadcn `Skeleton`** matching final layout (no layout shift) + button pending states + `isFetching` indicators |
| Errors | `error.tsx` per segment + `global-error.tsx` + `not-found.tsx` + `ErrorState` component with retry (`reset()`) + API error mapper (§8) |
| Animations | `framer-motion` (a.k.a. `motion`, latest): `whileInView` once, transform/opacity only, `useReducedMotion` respected, never animate table data |
| Fonts/media | `next/font`, `next/image` with `remotePatterns` for the Supabase storage host |
| State | **React Context** (`AuthProvider`, `PreferencesProvider` if needed). No zustand/redux |
| Quality gates | **Vitest + Testing Library + MSW** (unit), **Playwright** (e2e smoke), **Husky + lint-staged** pre-commit (`tsc`, eslint, prettier), **@next/bundle-analyzer** check |
| Commits | Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`…), push to GitHub |
| Deploy | Vercel, env per environment (§11) |

## 3. Latest Next.js features to use (verify against current docs at build time)

- **`proxy.ts`** (Next 16 renamed `middleware.ts` → `proxy.ts`, Node runtime) for
  auth gating: if the refresh cookie is absent → redirect `/login`. If the
  toolchain fights `proxy.ts`, fall back to `middleware.ts` (same logic).
- **Server Components by default** (marketing pages, layouts); `"use client"`
  only for interactive islands (tables, forms, dialogs, charts).
- **`"use server"` Server Actions** only where they fit (contact form fallback,
  tiny mutations) — dashboard CRUD stays on TanStack Query + axios (React-Query
  caching/optimistic updates beat actions for this app).
- **Cache Components / `use cache`** for slow public fragments if stable in the
  scaffolded version; otherwise route-level `revalidate`.
- **i18n via next-intl**: `[locale]` segment optional at first — ship `en`
  messages, keep every user-facing string in `messages/en.json` (never hardcoded),
  `dir` handling ready so Arabic/RTL is a translation drop later (backend already
  stores per-org `language`).
- `generateMetadata` per page, `sitemap.ts`, `robots.ts` (disallow `/dashboard`,
  `/login`), OG images, JSON-LD `Organization` schema on Home.
- Async `params`/`searchParams` (Next 15+ breaking change — await them).

## 4. Folder structure (colocation rule — the requested convention)

> Every component lives in its own folder with its CSS (only if needed) and its
> related files. Shared primitives stay shared; domain code never leaks sideways.

```
app/
  (marketing)/            # route group: /, /services, /about, /contact (+ page.tsx + metadata)
  (dashboard)/            # route group with dashboard layout (sidebar+topbar)
    dashboard/page.tsx    # overview (stats cards from /reports/*)
    properties/...  buildings(units nested routes)... units/... residents/...
    leases/... payments/... billing/... maintenance/... documents/...
    notifications/... reports/... settings/... users/... roles/...
    audit-logs/... webhooks/...
  layout.tsx              # root: fonts, Toaster, providers, metadata defaults
  loading.tsx  error.tsx  global-error.tsx  not-found.tsx
  sitemap.ts  robots.ts
proxy.ts                  # auth gating (refresh-cookie presence)
components/
  ui/                     # shadcn only (button, dialog, alert-dialog, sonner, skeleton,
                          # form, input, table, dropdown, sheet, avatar, badge, calendar,
                          # popover, command, chart?, textarea, select…)
  common/                 # DataTable/, ConfirmDialog, EmptyState, ErrorState,
                          # PageHeader (title + search + reload), Skeletons/, Pagination,
                          # CommandPalette/ (⌘K global search across entities),
                          # CurrencyInput/, PhoneInput/, Charts/ (lazy wrappers)
  layout/                 # SiteHeader, SiteFooter, Sidebar, Topbar, ThemeToggle…
  marketing/              # Hero/, FeatureGrid/, Stats/, CTASection/, ContactForm/…
                          # each: ComponentName/ComponentName.tsx (+ .module.css if needed)
  domain/<domain>/<ComponentName>/
                          # e.g. domain/payments/PaymentTable/{PaymentTable.tsx, columns.tsx}
                          # e.g. domain/leases/LeaseForm/{LeaseForm.tsx, schema.ts}
lib/
  api-client.ts           # axios instance + 401-refresh-retry + error mapping (§7)
  query-client.ts         # QueryClient defaults + query key factory (§7)
  supabase.ts             # browser client (anon key) for Realtime only
  auth-context.tsx        # AuthProvider: user/roles/permissions + hasPermission()
  permissions.ts          # permission-name helpers (mirrors backend catalog)
  format.ts               # currency/number/date formatters (Intl + date-fns)
  csv.ts                  # tiny JSON→CSV download helper (reports export, no lib)
  constants.ts            # pagination defaults, file limits, mimetypes
hooks/                    # useDebouncedValue (search inputs), useMediaQuery…
types/                    # api.ts — mirror backend DTOs (access/refresh/user/payment/…)
schemas/                  # shared zod schemas only (form-specific ones stay colocated)
messages/                 # en.json (all UI strings; ar.json later for RTL stretch)
e2e/                      # Playwright smoke (login → create property → delete)
AGENTS.md                 # repo conventions for humans + AI sessions (commands, rules)
public/                   # OG images, favicons, marketing assets
```

Rules: no barrel-file chains (`index.ts` re-exporting everything — deep imports only);
no prop drilling past 2 levels (context/query instead); no `any` (strict TS);
feature folders may own `hooks/useX.ts` + `schema.ts` + `*.module.css` next to the
component. CSS Modules only for marketing flourishes — dashboard styling is
Tailwind + shadcn tokens (dark-mode ready from day one).

## 5. Design language (expressive + impressive, recruiter-facing)

- Marketing: deep-navy + emerald accent (echoes the API brand "Better Properties.
  Happier Communities."), generous whitespace, big display type, sticky glass
  header, animated hero (gradient mesh + floating stat cards), scroll-reveal
  sections, animated counters, logo marquee, testimonial cards, pricing teaser,
  FAQ accordion, CTA band, rich footer. Fully responsive (mobile-first, hamburger
  → Sheet menu).
- Dashboard: dense professional SaaS — collapsible sidebar (Sheet on mobile),
  topbar with global search shortcut + notification bell (live badge via §9) +
  user menu, stat cards, tabs where sensible, consistent PageHeader everywhere.
- Dashboard overview: financial + occupancy **charts** (Recharts, lazy-loaded)
  fed by `/reports/*` — the visual payoff of the reports module.
- Command palette (⌘K, shadcn Command): jump to any entity by name (properties,
  residents, leases…) using existing `?search=` endpoints — the single most
  impressive 2-hour feature on this list.
- Accessibility: semantic landmarks (`header/main/nav/footer`, real `<table>`),
  `<label>` on every input, focus-visible rings, `aria-*` on dialogs/menus
  (Radix gives most of this free), skip-to-content link, contrast-checked
  palette, full keyboard operability.
- Performance: images via `next/image` (Supabase host in `remotePatterns`),
  route-level code splitting by default, dynamic-import only truly heavy islands,
  `whileInView={{ once: true }}`, skeletons sized like final content, debounced
  (350ms) server search, paginated everything (limit ≤ 100).

## 6. Pages & scope checklist

- [ ] `/`, `/services`, `/about`, `/contact` (RSC, metadata, animations)
- [ ] `/login` (email+password, no role picker — roles come from the API),
  silent-refresh boot, redirect-to-next
- [ ] `/dashboard` overview (financial + occupancy cards **+ Recharts charts**,
  **⌘K command palette** global)
- [ ] Properties → Buildings → Units (nested routes, search/filters, unit-type
  picker from `GET /unit-types`, money inputs as numbers)
- [ ] Residents (search/status, link-user dialog), Leases (overlap errors shown
  from API 409), Payments (filters incl. overdue/type) + checkout redirect +
  invoice download button, Billing success/cancel pages
- [ ] Maintenance (filters, assign dialog, status flow), Documents (upload with
  progress + type/size client pre-checks mirroring the API: 5MB + allowlist),
  Notifications inbox (unread filter, mark-read, read-all), Reports (currency
  from settings + **CSV export button**), Settings (profile + localization form), Users (invite +
  roles dialog), Roles (permissions checklist), Audit log (filters), Webhooks
  (CRUD + test-ping + deliveries drawer + rotate-secret dialog)

## 7. Backend contract (frozen — build against this)

- Base `https://propora-nestjs-postegresql.vercel.app`, prefix `/api/v1`,
  Swagger `/docs`, OpenAPI JSON `/docs-json`.
- **Auth**: `POST /auth/register` (201, creates org+owner) → `POST /auth/login`
  (200) → both return `{accessToken, refreshToken, expiresIn, tokenType, user}`.
  The refresh token is ALSO an httpOnly cookie (`propora_refresh_token`, path
  `/api/v1/auth`). `POST /auth/refresh` (200, cookie primary + `{refreshToken}`
  body fallback for mobile/Swagger — must agree if both sent; returns a NEW
  pair). `POST /auth/logout` (204), `POST /auth/forgot-password` (always 200),
  `POST /auth/reset-password` (200 + auto-login), `POST /auth/change-password`
  (200), `GET /auth/me` (user + `roles[]` + `permissions[]`), `PATCH /auth/me`,
  `DELETE /auth/me` (204, soft-delete; next login reactivates).
- **Axios**: `baseURL=NEXT_PUBLIC_API_URL`, `withCredentials:true`,
  request: attach in-memory access token; response 401 → single-flight refresh
  via cookie → retry once → else logout to `/login`. Never store tokens in
  `localStorage`.
- **proxy.ts gating**: dashboard routes require the refresh cookie; missing →
  `/login?next=…`. Fine-grained UI gating via `hasPermission(name)` from `/me`.
- **Pagination** (every list): `{data, meta:{total,page,limit,totalPages,hasNext,hasPrev}}`.
  Query params: `page, limit` + per-endpoint filters (see Swagger — all typed:
  `search/status/type/unreadOnly/overdue/...`; booleans as `?x=true|false`).
- **Errors**: `{statusCode, message: string|string[], error, timestamp, path,
  requestId?}`. Map: 400 → field errors (join arrays), 401 → re-auth, 403 →
  "no permission" empty-state, 404 → "not found or not yours" (multitenancy!),
  409 → show message (overlaps/duplicates), 429 → respect `Retry-After`.
- **Money**: plain numbers + `currency` string (org default from settings).
  **Dates**: send `YYYY-MM-DD` or ISO; read ISO strings (format with `Intl`).
- **Realtime (§9)**: Supabase browser client, channel `propora:org:<orgId>`
  (orgId from `/me`), `.on('broadcast', {event:'*'}, …)` for
  `notification.created | payment.paid | maintenance.assigned` → invalidate
  TanStack queries + toast + bell badge. No socket.io on Vercel.
- **Uploads**: `multipart/form-data` → `POST /documents/upload` fields
  `file, entityType, entityId, name?, category?`; pre-check client-side
  (5MB; pdf/jpg/png/webp/doc/docx/xls/xlsx/txt/csv). Invoices:
  `GET /payments/:id/invoice` (PDF blob download). Checkout:
  `POST /payments/:id/checkout` → `{checkoutUrl}` → redirect.
- **Rate limits**: 100/min general, 10/min auth; 429 carries `Retry-After`.
- **Roles**: `GET /roles` (org pickers), `GET /unit-types` (unit form picker).
  Full permission catalog (53) in backend README — gate nav/actions on names
  like `property:create`, `payment:read`, `audit:read`.
- **Cross-origin**: the dashboard runs on another Vercel origin — backend
  already supports it (`CORS_ORIGIN=<dashboard-url>`, `COOKIE_SAMESITE=none`,
  both server env). Contact form has NO backend endpoint yet → validated UI +
  `mailto:` fallback, wire later (do not invent an endpoint).

## 8. Env (frontend)

```
NEXT_PUBLIC_API_URL=https://propora-nestjs-postegresql.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_APP_URL=https://<frontend>.vercel.app   # metadata/OG only
```

## 9. Definition of done (verify all before pushing)

- [ ] `tsc --noEmit`, eslint, `next build` green; unit + e2e suites green;
  pre-commit hooks (husky) installed; no `any`, no console logs
- [ ] Every table: search works, pagination works, reload refetches, empty +
      loading (skeleton) + error (+retry) states all reachable and styled
- [ ] Every delete behind AlertDialog; every mutation toasts success/error
- [ ] Auth: login/logout/refresh-across-reload/403-gating/404 pages all walked
      through manually; proxy.ts redirects correctly logged-out
- [ ] Marketing: Lighthouse-friendly (images, fonts, metadata, sitemap),
      responsive at 360/768/1280/1920, keyboard + reduced-motion checked
- [ ] Realtime bell updates without refresh (two browsers test)
- [ ] All user-facing strings via `messages/en.json` (no hardcoded copy —
      Arabic/RTL later is translations-only)
- [ ] Vercel preview deploy green with the 4 env vars above (+ analytics
      showing real data, bundle size sane per analyzer)

## 10. Start order for the implementer session

1. `npx create-next-app@latest` (TS + Tailwind + App Router + Turbopack),
   install: `axios @tanstack/react-query @tanstack/react-table react-hook-form
   zod @hookform/resolvers framer-motion lucide-react @supabase/supabase-js
   recharts date-fns next-intl next-themes react-number-format
   @vercel/analytics @vercel/speed-insights`,
   dev: `vitest @testing-library/react @testing-library/jest-dom msw playwright
   @axe-core/playwright husky lint-staged @next/bundle-analyzer
   @sentry/nextjs` (sentry optional),
   `shadcn init` + add needed primitives + `sonner`.
2. Shell first: root layout (fonts/Toaster/providers), proxy.ts, login page,
   dashboard layout, PageHeader/DataTable/ConfirmDialog/ErrorState/Skeletons.
3. Marketing pages (fast wins, SEO), then domain pages module by module,
   auth + realtime wiring throughout, final DoD pass, conventional commits,
   push to GitHub, Vercel deploy.

## 11. Testing, security & repo hygiene (the parts most CVs skip)

- **Unit (vitest + Testing Library + MSW):** auth context + permission gating,
  form validation schemas, DataTable behaviors, currency/date formatters,
  axios 401-retry interceptor. Mock the API with MSW handlers mirroring §7.
- **E2E (Playwright):** login → create property → upload doc → delete property;
  a11y spot-check via `@axe-core/playwright` on dashboard + marketing.
- **Security headers** (`next.config` + Vercel): `poweredByHeader:false`,
  `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`. No secrets in client code — only `NEXT_PUBLIC_*`.
- **Repo files:** `AGENTS.md` (commands, conventions, DoD pointer),
  `.editorconfig`, `.nvmrc` (Node 22), Dependabot (monthly Shoe updates),
  `.env.example` (all 4 vars documented, values empty).
- **Explicitly out of scope:** Storybook, PWA wrapper, CMS, platform-admin UI
  (phase 2), backend changes (contract is frozen — discrepancies go back to
  the backend session with a Swagger link + request/response paste).
