import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/privacy";
import { Contact } from "~/components/ContactLine";
import { ProsePage } from "~/components/ProsePage";
import { cached } from "~/lib/api.server";
import { contactEmails, siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";

export const headers = passLoaderHeaders;

export function loader() {
  return cached({ site: siteConfig(), email: contactEmails().general });
}

const INTRO = "What we collect, why, who helps us process it, and how to get it changed or deleted.";

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/privacy",
    title: "Privacy policy",
    description: INTRO,
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Privacy policy", path: "/privacy" }])],
  });
}

// Draft describing how the platform actually handles data. Have it reviewed by a lawyer before launch.
export default function Privacy({ loaderData }: Route.ComponentProps) {
  const { email } = loaderData;
  return (
    <ProsePage title="Privacy policy" intro={INTRO} path="/privacy">
      <h2>Reading the site</h2>
      <p>
        You can read CoinGist without an account. We count visits with Plausible Analytics, which doesn&rsquo;t use cookies or
        collect personal data; we see totals such as page views and which countries readers come from. We don&rsquo;t use
        third-party advertising trackers.
      </p>
      <p>
        The &ldquo;Stocks to watch&rdquo; panel on the home page is provided by TradingView and loads from their servers, so
        TradingView receives your IP address and browser details when it appears, and handles them under its own privacy policy.
      </p>
      <h2>Newsletters</h2>
      <p>
        When you sign up we keep your email address, the newsletters you chose, where on the site you signed up, and when you
        confirmed. Our newsletter provider (Beehiiv) stores the same details to send the emails. Every email has an unsubscribe
        link; unsubscribing stops the emails straight away.
      </p>
      <h2>Reader accounts</h2>
      <p>
        If you create an account we keep your email address (and your name if you sign in with Google), the stories you save and
        the writers and topics you follow. They&rsquo;re private to you and used only to run your account and your For you
        feed. Sign-in is handled by Supabase.
      </p>
      <p>
        Comments are public: anyone can read them, with the name you choose to show (never your email). Likes are counted but
        not shown against your name. You can edit or delete your own comments at any time.
      </p>
      <p>
        You can deactivate your account from your account page. That signs you out and hides your comments; nothing is deleted,
        and signing in again brings it all back. To have your account and data deleted for good, contact us (see Your rights).
      </p>
      <h2>Cookies</h2>
      <ul>
        <li><strong>theme</strong>: remembers light or dark mode, if you choose one.</li>
        <li><strong>Sign-in cookies</strong> (only if you sign in): keep you signed in. One of them, <strong>cg_signed_in</strong>, holds no personal data; it just tells the page to show your account link.</li>
      </ul>
      <p>We don&rsquo;t use cookies for advertising or cross-site tracking.</p>
      <h2>Ads and sponsored content</h2>
      <p>When you click an ad we count the click for the sponsor&rsquo;s report. The count isn&rsquo;t linked to you.</p>
      <h2>Security and retention</h2>
      <p>
        Data is stored with access limited to the staff who need it, and every staff account uses two-factor sign-in. We keep
        newsletter and account data while you&rsquo;re subscribed or have an account, and delete it when you ask us to.
      </p>
      <h2>Your rights</h2>
      <p>
        Depending on where you live (for example under Nigeria&rsquo;s Data Protection Act, Kenya&rsquo;s Data Protection Act,
        South Africa&rsquo;s POPIA or the EU&rsquo;s GDPR) you can ask to see, correct, export or delete your data, or object to
        how we use it. To make a request, <Contact email={email} subject="Privacy request" />.
      </p>
      <h2>Changes</h2>
      <p>If we change how we use your data, we&rsquo;ll update this page and, for significant changes, tell subscribers by email.</p>
    </ProsePage>
  );
}
