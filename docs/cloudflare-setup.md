# Cloudflare in front of CoinGist

Cloudflare (free plan) gives CoinGist DNS, DDoS protection, a firewall and rate limiting.
Netlify keeps hosting and caching the site. Do this once the domain is bought.

The app is already Cloudflare-ready: rate limits read the visitor's real IP from the
`CF-Connecting-IP` header, and pages set their own security headers.

## 1. Move the domain's DNS to Cloudflare

1. Create a free Cloudflare account and **Add a site** with your domain (e.g. `coingist.com`).
2. At the registrar (e.g. Hostinger), replace the nameservers with the two Cloudflare gives you.
3. Wait for Cloudflare to say the site is **Active** (minutes to a few hours).

## 2. Add the domains in Netlify first

- Public site (`coingist-preview`): add `coingist.com` and `www.coingist.com` as custom domains.
- Studio + API (`coingist-studio`): add `studio.coingist.com`.

## 3. DNS records in Cloudflare

| Type  | Name     | Target                          | Proxy                      |
|-------|----------|---------------------------------|----------------------------|
| CNAME | `@`      | `coingist-preview.netlify.app`  | DNS only at first, then Proxied |
| CNAME | `www`    | `coingist-preview.netlify.app`  | DNS only at first, then Proxied |
| CNAME | `studio` | `coingist-studio.netlify.app`   | DNS only at first, then Proxied |

Leave them **DNS only (grey cloud)** until Netlify shows the HTTPS certificate as issued for
every domain (Domain management → HTTPS). Then switch them to **Proxied (orange cloud)**.

Email records (MX, SPF, DKIM, DMARC) for your mailbox and for Resend are always **DNS only**.

## 4. SSL/TLS

- SSL/TLS mode: **Full (strict)**. Never "Flexible": it causes endless redirects with Netlify.
- Edge Certificates: **Always Use HTTPS** on, **Minimum TLS 1.2**.
- Configuration Rule: for URI path starting with `/.well-known/acme-challenge/`, set
  SSL to Full and turn off "Always Use HTTPS", so Netlify can renew its certificate.

## 5. Settings that must stay OFF (they break the site)

CoinGist's Content Security Policy blocks scripts that Cloudflare would inject.

- Speed → **Rocket Loader: Off** (breaks React and the script nonce).
- Scrape Shield → **Email Address Obfuscation: Off** (injects a script).
- Analytics → **Web Analytics automatic setup: Off** (injects a beacon; we use Plausible).
- Security → **Bot Fight Mode: Off**. The public site's server calls the API at
  `studio.coingist.com/api`; Bot Fight Mode can challenge those server-to-server requests and
  take the site down. Use the rate limiting rule below instead.

## 6. Caching

Netlify already caches pages for 60 seconds and refreshes them in the background. Cloudflare
doesn't cache HTML by default; keep it that way. Add one Cache Rule:

- **Bypass cache** when URI path starts with any of: `/account`, `/for-you`, `/engagement`,
  `/go/`, `/api/`, `/resources/`.

## 7. Security

- Security → WAF → **Managed rules**: turn on the Cloudflare Free Managed Ruleset.
- Security → WAF → **Rate limiting rules** (free plan allows one rule):
  - When: request method is `POST` **and** URI path is one of `/newsletter`, `/account/login`.
  - Same IP more than **10 requests per 10 seconds** → **Block** for 10 seconds.
- Optional custom rule: **Managed Challenge** for `studio.coingist.com` from countries your
  staff never work from, but not for `studio.coingist.com/api/*` (the public site uses it).

## 8. After switching on

- Update the Netlify environment: `SITE_URL=https://coingist.com` (public site) and the Studio
  site's `STUDIO_ALLOWED_ACTION_ORIGINS` / Supabase redirect URLs, as in
  `docs/custom-domain-checklist.md`.
- Check: the home page loads over HTTPS, the browser console shows no CSP errors, newsletter
  sign-up works, and Studio sign-in works.
