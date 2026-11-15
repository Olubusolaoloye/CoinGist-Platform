# CoinGist

Web3/crypto news and gist platform with an African lens. See `CLAUDE.md` for product rules.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Public site: React Router v7 (framework mode, SSR) + Tailwind |
| `apps/studio` | Writer/editor/admin dashboard (SSR, `noindex`) |
| `apps/api` | Hono REST API: auth, role/permission/2FA guards, admin routes |
| `packages/types` | Shared enums, roles, permissions, workflow rules, content types, zod schemas |
| `packages/db` | Database interface, Postgres driver, repositories, PGlite dev/test database, seed data |
| `packages/seo` | Meta/Open Graph/X tags, canonical URLs, JSON-LD (NewsArticle, BreadcrumbList, ProfilePage) |
| `packages/ui` | Shared React: the allowlist-based rich text renderer (Tiptap JSON → React) |
| `supabase/migrations` | SQL schema, workflow functions, RLS |

## Getting started

```bash
pnpm install
pnpm dev:local   # API on in-memory Postgres with sample content (:8787) + public site (:5173)
pnpm test        # unit + DB + API tests (no Postgres needed: uses PGlite)
pnpm test:e2e    # Playwright: key flows, SEO tags, axe WCAG AA, mobile + desktop
pnpm typecheck
pnpm build
pnpm dev         # against real services: web :5173, studio :5174, api :8787 (needs .env)
```

`dev:local` needs no accounts or secrets. Its data resets on every start. The sample
people, sponsors and stories in `packages/db/dev/seed.ts` are fictional placeholders.

Copy `.env.example` to `.env` once a Supabase project exists.

## Security model (step 1)

- **Roles:** `reader < writer < editor < admin`, stored in `public.users.role`. The API reads the
  role from the DB on every request, never from the JWT, so demotions take effect immediately.
- **2FA:** staff privileges (writer and up) only apply on an `aal2` session (after TOTP), both
  in the API (`requirePermission`) and in RLS (`staff_at_least()`).
- **RLS on every table:** the API runs each query as the caller (`set local role authenticated`
  plus JWT claims), so RLS is a second line of defence behind the API checks.
- **Editorial workflow:** clients cannot write `status`, `approved_by`, `published_at` and so on
  (column grants). Status changes go only through `transition_post()`, which enforces
  `draft → in_review → changes_requested | approved → scheduled → published`. A DB constraint
  requires a human approver before anything is approved, scheduled or published. Editors can't
  approve their own posts; admins can, and it is audited.
- **Audit log:** append-only (trigger blocks update/delete); role/status/post transitions are logged.

## Public site (step 2)

- **Rendering:** every page is server-rendered by React Router v7. Loaders call the API's
  `/v1/public/*` endpoints, which query as `anon` so RLS only ever returns live posts.
- **Routes:** `/`, `/news`, `/gist`, `/learn`, `/africa`, `/category/:slug`, `/tag/:slug`,
  `/author/:slug`, `/:section/:slug`. A story requested under the wrong section 301s to its one
  canonical URL; `/category/africa` 301s to `/africa`.
- **SEO:** canonical URLs, Open Graph and X cards, NewsArticle + BreadcrumbList JSON-LD on every
  post, ProfilePage on authors, `noindex` on errors and thin tag pages.
- **Caching:** pages send `s-maxage=60, stale-while-revalidate=300` for the CDN; any 4xx/5xx is
  `no-store` (see `apps/web/app/entry.server.tsx`).
- **Rich text:** post bodies are Tiptap JSON rendered through an allowlist (`packages/ui`). There is
  no `dangerouslySetInnerHTML`, unsafe URLs are dropped, and outbound links get `nofollow` (or
  `sponsored` on sponsored posts).
- **Design:** adire indigo and danfo yellow, defined as CSS variables in `apps/web/app/app.css`;
  dark mode swaps the variables. The theme choice is a cookie, so the server renders the right
  theme with no flash, and the toggle works without JavaScript.
- **Measured (local, Lighthouse mobile):** performance 97–98, accessibility/best practices/SEO
  100, CLS 0, LCP about 2.2s on simulated slow 4G.

## Swapping the database (e.g. Convex)

The API depends only on the `Repositories` interface in `packages/db/src/repositories.ts`.
Moving to Convex means writing a new implementation of that interface. Note that RLS would no
longer exist, so the API-level guards become the only line of defence. Port the rules in
`supabase/migrations/*_auth_rls.sql` (and their tests) into the Convex functions.

## Tests

- `packages/db/test`: runs the real migrations in PGlite behind a small Supabase shim
  (`supabase-shim.sql`: `auth` schema, API roles). It covers enum drift, RLS per role, the full
  role × status transition matrix against `canTransition()`, and user admin rules.
- `apps/api/test`: HTTP-level tests with real signed JWTs: token validation, the per-role
  access matrix for every admin route, rate limiting, CORS and security headers.
