import { Link } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/terms";
import { Contact } from "~/components/ContactLine";
import { ProsePage } from "~/components/ProsePage";
import { cached } from "~/lib/api.server";
import { contactEmails, siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export function loader() {
  return cached({ site: siteConfig(), email: contactEmails().general });
}

const INTRO = "The rules for using CoinGist, in plain English.";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/terms",
    title: "Terms of use",
    description: INTRO,
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Terms of use", path: "/terms" }])],
  });
}

// Draft. Have it reviewed by a lawyer (and name the publishing entity and governing law) before launch.
export default function Terms({ loaderData }: Route.ComponentProps) {
  const { email } = loaderData;
  return (
    <ProsePage title="Terms of use" intro={INTRO} path="/terms">
      <h2>Not financial advice</h2>
      <p>
        CoinGist publishes news and education. Nothing on the site or in our newsletters is financial, investment, legal or tax
        advice, or a recommendation to buy or sell anything. Crypto assets are volatile and you can lose all the money you put
        in. Do your own research and consider independent advice.
      </p>
      <h2>Prices and data</h2>
      <p>Prices shown on the site come from third-party sources, can be delayed, and may be wrong. Don&rsquo;t rely on them to trade.</p>
      <h2>Using our content</h2>
      <p>
        You&rsquo;re welcome to share links to our stories and quote short extracts with a link back. Please don&rsquo;t republish
        whole stories, images or newsletters without permission.
      </p>
      <h2>Sponsored content and links</h2>
      <p>
        Sponsored stories and ads are always labelled; the sponsor is responsible for its claims. We check advertisers, but we
        don&rsquo;t endorse their products. Links to other sites are provided for reference and we&rsquo;re not responsible for
        their content. See our <Link to="/advertise">advertising standards</Link>.
      </p>
      <h2>Accounts</h2>
      <p>
        Keep your sign-in email secure. We may suspend accounts used to abuse the site. You can stop using your account at any time;
        see our <Link to="/privacy">privacy policy</Link> for how to delete your data.
      </p>
      <h2>Corrections</h2>
      <p>We work hard to get things right and correct mistakes promptly. See our <Link to="/editorial-policy">editorial policy</Link>.</p>
      <h2>Changes and contact</h2>
      <p>
        We may update these terms; the current version is always on this page. Questions? <Contact email={email} subject="Terms of use" />.
      </p>
    </ProsePage>
  );
}
