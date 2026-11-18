import { Link } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/advertise";
import { Contact } from "~/components/ContactLine";
import { ProsePage } from "~/components/ProsePage";
import { cached } from "~/lib/api.server";
import { contactEmails, siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export function loader() {
  return cached({ site: siteConfig(), email: contactEmails().advertising });
}

const INTRO = "Reach readers across Africa who want to understand crypto, with placements that are always clearly labelled.";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/advertise",
    title: "Advertise with CoinGist",
    description: INTRO,
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Advertise", path: "/advertise" }])],
  });
}

// Editors: review this wording and add rates before launch.
export default function Advertise({ loaderData }: Route.ComponentProps) {
  const { email } = loaderData;
  return (
    <ProsePage title="Advertise with CoinGist" intro={INTRO} path="/advertise">
      <h2>What we offer</h2>
      <ul>
        <li><strong>Sponsored stories:</strong> an article written with our editors, published in the Sponsored section and labelled &ldquo;Sponsored&rdquo; everywhere it appears.</li>
        <li><strong>Display slots:</strong> a banner on the home page and a slot at the end of articles. Sizes are fixed so pages don&rsquo;t jump while they load.</li>
        <li><strong>Newsletter sponsorships:</strong> one sponsor slot in the Daily Gist and one in the Weekly Wrap.</li>
      </ul>
      <h2>Our standards</h2>
      <p>Before we accept any campaign we check:</p>
      <ul>
        <li>who you are, and your regulatory status where you operate;</li>
        <li>that nothing promises guaranteed returns or says an investment can&rsquo;t lose money;</li>
        <li>every link, against our list of scam and phishing domains;</li>
        <li>that you agree to the &ldquo;Sponsored&rdquo; label and our disclosure wording;</li>
        <li>payment terms, agreed up front.</li>
      </ul>
      <p>
        Sponsors never see or influence our news coverage, and advertising links are marked as sponsored for search engines.
        We don&rsquo;t place third-party ad trackers on the site. Read how we keep the two apart in our{" "}
        <Link to="/editorial-policy">editorial policy</Link>.
      </p>
      <p>We may turn down any campaign, including crypto products we don&rsquo;t think our readers should be offered.</p>
      <h2>Get in touch</h2>
      <p>
        To ask about dates and rates, <Contact email={email} subject="Advertising with CoinGist" />. Tell us what you&rsquo;d like to promote,
        where you operate, and your timing.
      </p>
    </ProsePage>
  );
}
