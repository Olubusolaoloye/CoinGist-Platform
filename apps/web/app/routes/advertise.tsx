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

type Kind = "home" | "article" | "newsletter" | "sponsored";
const PLACEMENTS: { kind: Kind; name: string; where: string; size: string }[] = [
  { kind: "home", name: "Home page banner", where: "Full width on the home page, between the latest stories and the topics.", size: "1200 × 250 px" },
  { kind: "article", name: "End of story", where: "After the last paragraph of every news story (never on sponsored stories).", size: "1200 × 400 px" },
  { kind: "newsletter", name: "Newsletter sponsor", where: "One slot in the Daily Gist (weekdays) and one in the Weekly Wrap.", size: "600 × 200 px" },
  { kind: "sponsored", name: "Sponsored story", where: "An article written with our editors, in the Sponsored section and labelled \u201cSponsored\u201d everywhere it appears.", size: "Hero image 1600 × 900 px" },
];

/** A tiny page diagram with the placement highlighted in brand yellow. Decorative. */
function Wireframe({ kind }: { kind: Kind }) {
  const line = "fill-[var(--line)]";
  const slot = "fill-[var(--gist)]";
  return (
    <svg viewBox="0 0 240 140" aria-hidden="true" className="h-auto w-full rounded-lg bg-paper">
      <rect x="0" y="0" width="240" height="16" className="fill-[var(--night)]" />
      {kind === "home" ? (
        <>
          <rect x="12" y="26" width="140" height="44" rx="4" className={line} />
          <rect x="160" y="26" width="68" height="44" rx="4" className={line} />
          <rect x="12" y="80" width="216" height="24" rx="4" className={slot} />
          <rect x="12" y="114" width="66" height="18" rx="3" className={line} />
          <rect x="87" y="114" width="66" height="18" rx="3" className={line} />
          <rect x="162" y="114" width="66" height="18" rx="3" className={line} />
        </>
      ) : kind === "article" ? (
        <>
          <rect x="50" y="26" width="140" height="10" rx="2" className={line} />
          {[44, 54, 64, 74].map((y) => <rect key={y} x="50" y={y} width={y === 74 ? 96 : 140} height="5" rx="2" className={line} />)}
          <rect x="50" y="88" width="140" height="44" rx="4" className={slot} />
        </>
      ) : kind === "newsletter" ? (
        <>
          <rect x="70" y="24" width="100" height="10" rx="2" className={line} />
          <rect x="70" y="42" width="100" height="34" rx="4" className={slot} />
          {[86, 96, 106, 116, 126].map((y) => <rect key={y} x="70" y={y} width="100" height="5" rx="2" className={line} />)}
        </>
      ) : (
        <>
          <rect x="50" y="24" width="38" height="8" rx="4" className={slot} />
          <rect x="50" y="38" width="140" height="10" rx="2" className={line} />
          <rect x="50" y="54" width="140" height="44" rx="4" className={slot} />
          {[106, 116, 126].map((y) => <rect key={y} x="50" y={y} width="140" height="5" rx="2" className={line} />)}
        </>
      )}
    </svg>
  );
}

// Editors: review this wording and add rates before launch.
export default function Advertise({ loaderData }: Route.ComponentProps) {
  const { email } = loaderData;
  return (
    <ProsePage title="Advertise with CoinGist" intro={INTRO} path="/advertise">
      <h2>Where your ad appears</h2>
      <p>
        One advertiser per slot at a time. Every placement is labelled as an advertisement, and sizes are
        fixed so pages don&rsquo;t jump while they load.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {PLACEMENTS.map((p) => (
          <div key={p.name} className="glass rounded-2xl p-4">
            <Wireframe kind={p.kind} />
            <h3 className="mt-3 font-display text-lg font-extrabold">{p.name}</h3>
            <div className="mt-1 text-sm text-muted">{p.where}</div>
            <div className="mt-2 text-sm"><span className="font-semibold">Image:</span> {p.size}</div>
          </div>
        ))}
      </div>
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
      <h2>How booking works</h2>
      <ol>
        <li>Tell us what you&rsquo;d like to promote, where you operate, and your dates.</li>
        <li>We check the campaign against the standards above and agree the price.</li>
        <li>You send the image (the size listed for the slot, or larger in the same shape) and the link.</li>
        <li>An editor approves it and it goes live on your start date. We count clicks on every ad.</li>
      </ol>
      <h2>Get in touch</h2>
      <p>
        To ask about dates and rates, <Contact email={email} subject="Advertising with CoinGist" />.
      </p>
    </ProsePage>
  );
}
