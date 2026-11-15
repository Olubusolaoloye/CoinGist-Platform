# CoinGist

Web3/crypto news and gist platform with an African lens. See `CLAUDE.md` for product rules.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Public site: React Router v7 (framework mode, SSR) + Tailwind |
| `apps/studio` | Writer/editor/admin dashboard (SSR, `noindex`) |
| `apps/api` | Hono REST API: auth, role/permission/2FA guards, admin routes |
| `packages/types` | Shared enums, roles, permissions, workflow rules, zod schemas |
| `packages/db` | Database interface, Postgres driver, repositories, PGlite test harness |
| `supabase/migrations` | SQL schema, workflow functions, RLS |

## Getting started

```bash
pnpm install
pnpm test        # all unit + DB + API tests (no Postgres needed: uses PGlite)
pnpm typecheck
pnpm build
pnpm dev         # web :5173, studio :5174, api :8787 (api needs .env)
```

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
