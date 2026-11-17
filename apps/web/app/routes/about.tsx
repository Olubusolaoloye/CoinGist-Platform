import { Link } from "react-router";
import { breadcrumbJsonLd, buildMeta, organizationJsonLd } from "@coingist/seo";
import type { Route } from "./+types/about";
import { ProsePage } from "~/components/ProsePage";
import { cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export function loader() {
  return cached({ site: siteConfig() });
}

const INTRO = "Crypto and Web3 news for readers across Africa and beyond, explained in plain English.";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/about",
    title: "About CoinGist",
    description: INTRO,
    jsonLd: [
      { ...organizationJsonLd(data.site), description: INTRO },
      breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "About", path: "/about" }]),
    ],
  });
}

// Editors: review this wording before launch.
export default function About() {
  return (
    <ProsePage title="About CoinGist" intro={INTRO} path="/about">
      <p>
        CoinGist covers crypto and Web3 with an African lens: what moved, why it matters, and what it means for people
        sending money, saving, building or trading across the continent.
      </p>
      <h2>What we publish</h2>
      <ul>
        <li><strong>News:</strong> reported stories on what happened.</li>
        <li><strong>Gist:</strong> the story in a few lines, readable in under a minute.</li>
        <li><strong>Learn:</strong> plain-English guides for getting started and staying safe.</li>
      </ul>
      <p>
        Every story opens with &ldquo;The gist in 30 seconds&rdquo;, so you get the point before you decide to read on.
      </p>
      <h2>How we work</h2>
      <p>
        Every story is reviewed and approved by an editor before it goes live. Sponsored content is always labelled. Read the
        details in our <Link to="/editorial-policy">editorial policy</Link>.
      </p>
      <p>
        We publish news and education, not financial advice. Crypto assets are volatile and you can lose money.
      </p>
      <h2>Get the gist by email</h2>
      <p>
        The Daily Gist arrives every weekday morning. <Link to="/newsletter">Choose your newsletters</Link>.
      </p>
    </ProsePage>
  );
}
