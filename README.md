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
| `packages/seo` | Meta/Open Graph/X tags, canonical URLs, JSON-LD (NewsArticle, BreadcrumbList, ProfilePage), Studio SEO checklist |
| `packages/ui` | Shared React: the allowlist-based rich text renderer (Tiptap JSON → React) |
| `supabase/migrations` | SQL schema, workflow functions, RLS |

## Getting started

```bash
pnpm install
pnpm dev:local   # API on in-memory Postgres (:8787) + public site (:5173) + Studio (:5174)
pnpm test        # unit + DB + API tests (no Postgres needed: uses PGlite)
pnpm test:e2e    # Playwright: key flows, SEO tags, axe WCAG AA, mobile + desktop
pnpm typecheck
pnpm build
pnpm dev         # against real services: web :5173, studio :5174, api :8787 (needs .env)
```

`dev:local` needs no accounts or secrets. Its data resets on every start. The sample
people, sponsors and stories in `packages/db/dev/seed.ts` are fictional placeholders.
In Studio, pick a seeded account on the sign-in page (Amara Okafor is a writer, Tunde Bello
an editor, Dev Admin an admin, Sample Reader has no Studio access).

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

## Studio (step 3)

- **Sign-in:** Supabase magic link or Google, then TOTP 2FA (`/mfa`: QR enrolment the first
  time, a code after that). Staff get nothing until the session is `aal2`. Studio never creates
  accounts; admins invite staff. Locally, `STUDIO_AUTH=dev` swaps in a seeded-account picker. The
  production server refuses to start with it, so it only runs on the dev server.
- **Sessions and CSRF:** httpOnly, SameSite=Lax cookies. Every mutation is checked for a
  same-origin `Origin` (React Router also rejects foreign origins on its own).
- **Editor:** Tiptap with only the nodes the public renderer supports: headings, lists, quotes,
  code, links, images with required alt text, and YouTube/X embeds (shown on the site as link
  cards, not iframes). The API sanitises every body on save against the same allowlist
  (`packages/types/src/richtext.ts`).
- **Workflow:** buttons mirror `transition_post()`: writers submit, editors request changes
  (with a note that becomes a comment), approve, schedule, publish or unpublish. Editors can't
  approve their own work. Status changes are blocked while there are unsaved changes.
- **Also:** live SEO checklist and search preview, comments with resolve, revision history with
  restore, review queue (oldest first, own posts excluded), admin audit log, unsaved-changes
  warnings, Cmd/Ctrl+S.
- **Scheduling:** `pnpm --filter @coingist/api job:publish-scheduled` publishes due posts; run
  it every minute from a cron. The local API runs it automatically.

Not yet: image upload (needs Supabase Storage), sponsor selection (step 6), inline comments
anchored to text, editorial calendar, writer stats, the outbound scam-link scanner, and
concurrent-edit protection (today the last save wins).

## Newsletter (step 4)

- **Signup:** the `/newsletter` page offers the Daily Gist and the Weekly Wrap; the home and
  section pages end with a "Stay in the loop" banner and every article ends with a form. Forms work without JavaScript, and the web server
  limits signups per visitor IP.
- **Privacy:** the API always answers "check your inbox", so the form can't reveal who's
  subscribed. A hidden honeypot field drops bots, and the same address can't trigger another
  confirmation email within 10 minutes. We store the email, chosen lists, source and consent time.
- **Sync:** each signup is saved first, then sent to the newsletter tool. If the tool is down, the
  reader still sees success; the row is marked failed and `pnpm --filter @coingist/api
  job:sync-newsletter` retries it (run every few minutes; the local API does it every minute).
- **Webhooks:** `POST /v1/webhooks/newsletter` takes confirmations, unsubscribes and bounces.
  Requests must carry a valid Svix signature (Beehiiv delivers webhooks through Svix); stale
  timestamps are rejected.
- **Studio:** admins get a Subscribers page with counts per newsletter, a filterable list and
  "Retry now" for failed syncs.
- **Locally:** the dev provider logs instead of emailing. An address containing `+fail` simulates
  an outage.

**Check against Beehiiv's docs before launch** (they couldn't be reached from the build
environment): the optional request fields (`reactivate_existing`, `send_welcome_email`, `utm_*`,
`custom_fields`), the webhook event names and payload fields (`apps/api/src/newsletter/webhook.ts`
accepts a few shapes), and that a `lists` custom field exists in the publication so Beehiiv
segments can target each newsletter. Double opt-in is a Beehiiv publication setting; turn it on.
Webhooks need a paid Beehiiv plan.

## SEO, feeds and security (step 5)

- **Sitemaps:** `/sitemap.xml` indexes `/sitemap-pages.xml` (home, sections, categories, authors,
  tags with at least 3 stories, about and policy pages) and `/sitemap-posts.xml` (every live story).
  `/news-sitemap.xml` is the Google News sitemap: editorial stories from the last 48 hours, never
  sponsored ones.
- **RSS:** `/rss.xml`, `/news/rss.xml`, `/gist/rss.xml`, `/learn/rss.xml`, `/africa/rss.xml` and
  `/category/:slug/rss.xml`, each linked from its page's `<head>`. Sponsored items say
  "Sponsored:" in the title.
- **robots.txt** is generated: it lists both sitemaps, and blocks everything when `DEMO_MODE=true`.
- **Structured data:** sponsored stories use `AdvertiserContentArticle` (with the sponsor) instead of
  `NewsArticle`. `/editorial-policy` now exists, so the publisher's `publishingPrinciples` resolves.
  React Router escapes `<`, `>` and `&` in JSON-LD, so a headline can't break out of the script.
- **Content Security Policy** (production builds): a fresh nonce per response; scripts and the
  site's inline styles need it; no `unsafe-inline` on the public site; no framing, `<base>`,
  plugins, or form posts to other origins. Studio allows inline styles (the editor sets them) and
  form redirects to Supabase/Google for sign-in. E2E tests fail on any CSP violation.
- **Editorial pages:** `/about` and `/editorial-policy` describe what the system enforces. Editors
  should review the wording and add their own policies (conflicts of interest, sourcing standards,
  a corrections contact) before launch. `/privacy`, `/terms` and `/advertise` still need writing.
- **Performance (local Lighthouse, mobile):** 96 performance, 100 accessibility, best practices and
  SEO; CLS 0; LCP 2.3 s on simulated slow 4G. Inlining the stylesheet was tried and measured slower
  (FCP 2.2 s vs 2.0 s), so it stays a cached file.

## Sponsorship, ads, link safety and analytics (step 6)

- **Link safety:** editors keep a list of blocked domains in Studio (`/link-safety`). Approving
  any story fails while it links to a blocked domain or one of its subdomains, or while a sponsored
  story's sponsor website is on the list. The database enforces this through a trigger on approval;
  the editor sees which links, and why, in the status panel.
- **Sponsored orders** (`/sponsored`): inquiry, then vetting, then accepted or rejected, then in
  production, then published. An order can't be accepted until all six vetting items are ticked
  (identity, licensing, no promised returns, links scanned, disclosure agreed, payment agreed). A
  sponsored story can't be approved until an accepted order for its sponsor is linked to it, and
  publishing the story completes the order. Status changes are audited.
- **Ads and newsletter sponsors** (`/ads`): fixed slots (home banner, end of article, one per
  newsletter). Bookings go live only after approval, and approved bookings can't overlap. Ads are
  labelled "Advertisement from {sponsor}" and link through `/go/ad/:id`, which counts clicks
  (throttled per visitor) before redirecting, with `rel="sponsored"`. Sponsored stories carry no ads.
  An empty home slot shows a newsletter promo; an empty article slot shows nothing. Newsletter
  bookings are a record for the team; placing them in the email happens in Beehiiv.
- **Analytics:** Plausible, only when `PLAUSIBLE_DOMAIN` is set (optional `PLAUSIBLE_SCRIPT_URL`
  for self-hosting). No cookies. The CSP adds Plausible's origin only when it's enabled. Custom
  events: Newsletter Signup (with source), Share (with network), Ad Click (slot and sponsor).
- Click counts are a simple counter for sponsor reports; use Plausible's Ad Click events for
  numbers you can audit.

## Home page, carousels and search

- **Home:** a hero with "Today's gist in 30 seconds" (the lead story's gist), a "Just in" strip,
  a Top stories carousel beside numbered Editors' picks, topic tiles, one swipeable carousel per
  section, and the newsletter banner. The footer is always dark and lists every section.
- **Carousels** use native scroll-snap, so touch, trackpad and keyboard work without JavaScript;
  the arrow buttons and dots page through them. They never autoplay. Each slide is a labelled
  group ("2 of 4"), following the WAI-ARIA carousel pattern.
- **Editors' picks:** editors (not writers) tick "Feature in Editors' picks" in Studio. The
  database enforces this (`posts_featured_guard`), not just the UI.
- **Search:** `/search?q=` uses Postgres full-text search over titles, excerpts, tags and body
  text, ranked by relevance (`websearch_to_tsquery`, so any input is safe). Results are
  `noindex` and cached briefly at the CDN.
- **Read time** on cards is the body word count divided by 220, at least one minute.

## Dashboards and payouts (Studio)

- **Home by role:** admins land on Admin, editors on the editor dashboard, writers on their posts.
- **Editor dashboard** (`/dashboard`, editors and admins): counts by status; the review queue
  (oldest first, never your own stories); approved stories waiting for a slot; drafts untouched
  for a week; a two-week editorial calendar (scheduled and published, UTC, page by week);
  stories published per day for 30 days (with a table view); section mix; and per-writer activity.
- **Admin** (`/admin`, admins only): team by role, staff without 2FA, money owed to writers,
  sponsorship in progress, outstanding invoices, live ads, a "needs attention" list and recent
  audit events. Money in different currencies is never added together.
- **Team and roles** (`/admin/team`): change roles and suspend or reactivate accounts. The
  database refuses to demote the last admin, and admins can't suspend themselves.
- **Payouts** (`/admin/payouts`): record a payment for a published story (or a bonus), approve
  it, then mark it paid. Enforced in Postgres (`writer_payments_guard`): pending -> approved ->
  paid, or cancelled; paid is final; the amount locks on approval; a story is paid once (unless
  cancelled); the story must be published and written by that writer; payments are never deleted.
  Every step is in the audit log.
- **My earnings** (`/earnings`): writers see only their own payments (RLS).

## AI assist (step 7)

Studio only. Every result is a **suggestion with an explicit "use" button**: nothing the model
writes is saved, published or posted on its own, and stories still go through review.

- **In the editor (AI assist panel):** outline and draft from the writer's notes (using only what
  they provide; gaps come back as `[CHECK: ...]`), "the gist in 30 seconds", SEO title /
  description / slug / excerpt, internal links (related published stories, no AI request), a
  style and readability check (instant, no AI: reading ease, long sentences, passive voice,
  unexplained jargon, and hype or promises that break the editorial policy) plus an AI claim
  check, and repurposing as an X thread, Telegram post or newsletter blurb (copy only).
- **Trending digest** (`/trending`, editors): reads the RSS/Atom feeds in `TRENDING_FEEDS`, groups
  headlines into topics with an African angle, flags what CoinGist already covered, and can start
  a draft with a suggested headline.
- **Disclosure:** using any AI feature on a story logs it (`ai_usage`) and marks the story
  `ai_assisted` in the database. The flag can't be cleared, and the article says so to readers.
  Editors see who used which feature on a story.
- **Server-side and limited:** the browser never calls the model. The API checks `ai:use`
  (staff, 2FA), that you can see the story, a per-person daily limit (`AI_DAILY_LIMIT_*`, resets
  at midnight UTC) and a burst limit (12 a minute). Declines and outages are reported plainly and
  don't count against the limit.
- **Guardrails on output:** structured outputs (JSON schema) from Claude; lengths enforced after;
  claim quotes that don't appear in the story and links that didn't come from the feeds are
  dropped. The writer's text is passed as data inside tags, never as instructions.
- **Model:** Claude via the Anthropic SDK (`claude-opus-5-5` by default, `AI_MODEL` to change), with
  server-side refusal fallbacks. Without `ANTHROPIC_API_KEY`, AI is off in production; locally and
  in tests an offline generator that only rearranges the writer's own words stands in, and
  Studio labels it "Sample mode".

## Reader accounts (step 8)

- **Sign in** at `/account/login`: email magic link or Google (Supabase Auth); signing in creates a
  reader account. Locally you pick a seeded account; preview deploys give each visitor a
  throwaway demo reader. Without Supabase settings, production shows "coming soon".
- **Save stories** (bookmark button on every article), **follow** writers, topics and tags (buttons on
  articles, writer, topic and tag pages), and read **For you** (`/for-you`): new stories from what
  you follow, newest first, each labelled with why it's there. Manage everything at `/account`,
  including "clear my saved stories and follows".
- **Caching stays intact:** public pages never read the session, so the CDN serves the same HTML
  to everyone. A non-secret `cg_signed_in` cookie tells the page's JavaScript to fetch the reader's
  button states from `/account/state` (private, no-store). `/account*` and `/for-you` are
  `private, no-store` and `noindex`.
- **Security:** reader routes in the API (`/v1/me/*`) need a signed-in active account (no 2FA for
  readers); RLS keeps every row to its owner; triggers allow bookmarks only on published stories,
  follows only of real writers/topics/tags, and cap them (1,000 saved, 100 follows). Account form
  posts are same-origin only, and sign-in attempts are rate limited per IP. Buttons work with
  JavaScript; the account page's controls also work without it.

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
