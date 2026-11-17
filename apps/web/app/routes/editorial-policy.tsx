import { Link } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/editorial-policy";
import { ProsePage } from "~/components/ProsePage";
import { cached } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export function loader() {
  return cached({ site: siteConfig() });
}

const INTRO = "How CoinGist reports, reviews, labels and corrects what we publish.";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/editorial-policy",
    title: "Editorial policy",
    description: INTRO,
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Editorial policy", path: "/editorial-policy" }])],
  });
}

// Editors: these sections describe rules the publishing system enforces. Add your own policies
// (conflicts of interest, sourcing standards, corrections contact) before launch.
export default function EditorialPolicy() {
  return (
    <ProsePage title="Editorial policy" intro={INTRO} path="/editorial-policy">
      <h2>Every story has a human editor</h2>
      <p>
        Writers submit stories for review. An editor reads each one and either approves it or sends it back with notes. Nothing
        is published without that approval, and editors can&apos;t approve their own stories.
      </p>
      <h2>How we use AI</h2>
      <p>
        Writers may use AI tools to help with drafts, summaries or headlines. AI-generated text is never published automatically:
        an editor reviews and approves every story. When AI tools helped draft a story, we say so at the end of it.
      </p>
      <h2>Sponsored content</h2>
      <p>
        Sponsors pay for some stories. These are always marked <strong>Sponsored</strong>, with a note naming the sponsor at the
        top of the story. Links in sponsored stories are marked as sponsored for search engines, and sponsored stories are kept
        out of our news listings for search.
      </p>
      <h2>Updates and corrections</h2>
      <p>
        When we change a story after publishing it, the story shows the time it was last updated alongside the original
        publication time.
      </p>
      <h2>Not financial advice</h2>
      <p>
        We report and explain. We don&apos;t tell anyone what to buy, sell or hold. Crypto assets are volatile and you can lose
        money; do your own research.
      </p>
      <p>
        Read more <Link to="/about">about CoinGist</Link>.
      </p>
    </ProsePage>
  );
}
