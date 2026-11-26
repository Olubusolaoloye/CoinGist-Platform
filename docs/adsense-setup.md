# Google AdSense (fallback in empty ad slots)

Direct bookings sold through the Advertise page always come first. When a slot has no booking,
it shows Google AdSense; if Google has no ad to show, readers see the newsletter promo
(home banner) or nothing (end of article). It's all built and **off until configured**.

## 1. Apply

1. The real domain must be live first (Google rejects `*.netlify.app`).
2. Sign up at adsense.google.com with the domain and verify it. While Google reviews the site,
   set `ADSENSE_CLIENT` (step 3) so `/ads.txt` and the verification script are in place.
3. In AdSense → **Ads → By ad unit**, create two **Display ads** units, responsive:
   "CoinGist home banner" and "CoinGist article end". Note each ad unit ID (digits only).
4. Keep **Auto ads OFF**. The site only places ads in its reserved slots, so pages never jump.

## 2. Consent (EU, UK, Switzerland)

AdSense → **Privacy & messaging** → create a **European regulations** message (Google's own
certified consent tool) and publish it. The ad script shows it to readers who need it.

## 3. Netlify environment variables (public site)

| Variable                   | Example                   |
|----------------------------|---------------------------|
| `ADSENSE_CLIENT`           | `ca-pub-1234567890123456` |
| `ADSENSE_SLOT_HOME_BANNER` | `1234567890`              |
| `ADSENSE_SLOT_ARTICLE_END` | `9876543210`              |

Redeploy. Setting `ADSENSE_CLIENT` automatically:

- serves `/ads.txt` (`google.com, pub-…, DIRECT, f08c47fec0942fa0`);
- loads Google's ad script and allows Google's ad hosts in the Content Security Policy
  (inline styles are allowed too, because Google styles its ads inline);
- adds the Google ads and cookies paragraphs to the privacy policy.

Remove `ADSENSE_CLIENT` to switch everything off again.

## 4. Check

- `https://coingist.com/ads.txt` shows your publisher line.
- With an ad blocker off, the home banner shows an "Ad" label and a Google ad, or the
  newsletter promo when Google has nothing to show.
