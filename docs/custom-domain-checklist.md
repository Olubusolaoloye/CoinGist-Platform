# Moving to our own domain — checklist

While we run on Netlify's free addresses, these places hold them. When the domain is bought
(e.g. `coingist.com` for the site and `studio.coingist.com` for Studio), update every item.

Current addresses:
- Public site: `https://coingist-preview.netlify.app`
- Studio + API: `https://coingist-studio.netlify.app` (API at `/api`)
- Supabase: `https://dznqcggbdpcfticctclj.supabase.co`

## 1. Netlify
- [ ] Public site project → Domain management → add `coingist.com` (and `www`), set it as primary.
- [ ] Studio project → Domain management → add `studio.coingist.com`.
- [ ] Studio project env vars: `STUDIO_URL`, `API_URL` (`https://studio.coingist.com/api`), `SITE_URL` (`https://coingist.com`). Then redeploy.
- [ ] Public site env vars: `SITE_URL`, `API_URL` (when the site switches from demo data to the real API), `CORS_ORIGINS` on the API if the site calls it from the browser. Then redeploy.

## 2. Supabase (Authentication → URL Configuration)
- [ ] Site URL → `https://coingist.com`.
- [ ] Redirect URLs → add `https://studio.coingist.com/auth/callback` and `https://coingist.com/account/callback`; remove the netlify.app ones once the new ones work.
- [ ] Custom domain for auth (Pro plan + Custom Domain add-on), e.g. `auth.coingist.com`, so Google's screen no longer shows `…supabase.co`. Then add `https://auth.coingist.com/auth/v1/callback` to the Google client's redirect URIs.
- [ ] Custom SMTP sender (Resend) on the new domain, e.g. `no-reply@coingist.com`.

## 3. Google Cloud (CoinGist project → Google Auth Platform)
- [ ] Branding → Application home page `https://coingist.com`, privacy `https://coingist.com/privacy`, terms `https://coingist.com/terms`.
- [ ] Branding → Authorized domains → add `coingist.com`; remove the netlify.app ones afterwards.
- [ ] Clients → "CoinGist Supabase" → Authorized JavaScript origins → `https://coingist.com`, `https://studio.coingist.com`.
- [ ] Verify `coingist.com` in Google Search Console, add the logo (`brand/coingist-logo-120.png`), then Branding → **Verify branding**. Only after this does Google's sign-in screen say "CoinGist" instead of a web address.
- The redirect URI (`…supabase.co/auth/v1/callback`) does not change.

## 4. Elsewhere
- [ ] Beehiiv: publication URL and webhook, once the newsletter is connected.
- [ ] Google Search Console + submit `https://coingist.com/sitemap.xml`.
- [ ] Analytics (`PLAUSIBLE_DOMAIN`) and Sentry allowed domains, if used.
