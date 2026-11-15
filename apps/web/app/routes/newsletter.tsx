import { data, Form, useNavigation } from "react-router";
import { breadcrumbJsonLd, buildMeta } from "@coingist/seo";
import type { Route } from "./+types/newsletter";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { NewsletterForm } from "~/components/NewsletterSignup";
import { cached, subscribeToNewsletter, type SubscribeResult } from "~/lib/api.server";
import { siteConfig } from "~/lib/config.server";
import { passLoaderHeaders } from "~/lib/headers";
import { allow, clientIp } from "~/lib/ratelimit.server";

export const headers = passLoaderHeaders;

export function loader() {
  return cached({ site: siteConfig() });
}

/** Handles every signup form on the site (footer and article forms post here too). */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const noStore = { "Cache-Control": "no-store" };
  const max = Number(process.env["NEWSLETTER_SIGNUPS_PER_10_MIN"] ?? 5);
  if (!allow(`newsletter:${clientIp(request)}`, max, 10 * 60_000)) {
    return data<SubscribeResult>({ ok: false, message: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: noStore });
  }
  const result = await subscribeToNewsletter({
    email: String(form.get("email") ?? ""),
    lists: form.getAll("lists").map(String),
    source: String(form.get("source") ?? "other"),
    website: String(form.get("website") ?? ""),
  });
  return data<SubscribeResult>(result, { status: result.ok ? 200 : 400, headers: noStore });
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return buildMeta({
    site: data.site,
    path: "/newsletter",
    title: "Newsletters",
    description: "The Daily Gist every weekday morning and the Weekly Wrap on Saturdays. Crypto news with an African lens, free in your inbox.",
    jsonLd: [breadcrumbJsonLd(data.site, [{ name: "Home", path: "/" }, { name: "Newsletters", path: "/newsletter" }])],
  });
}

export default function Newsletter({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Newsletters", path: "/newsletter" }]} />
      <header className="mt-4 border-b-2 border-ink pb-5">
        <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">Get the gist in your inbox</h1>
        <p className="mt-3 max-w-[58ch] text-lg text-muted">
          Crypto moves fast. Our editors pick what matters for readers across Africa and explain it in plain English. Free, and you can
          unsubscribe from any email.
        </p>
      </header>

      <Form method="post" className="relative mt-8">
        <NewsletterForm result={actionData} busy={busy} />
      </Form>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">What to expect</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-lg">
          <li>An email to confirm your address first. Nothing arrives until you click it.</li>
          <li>Stories from the CoinGist newsroom, never paid tips. Sponsored sections are always labelled.</li>
          <li>No financial advice. We explain what happened; you decide what to do.</li>
        </ul>
        <p className="mt-6 text-sm text-muted">
          We keep your email address and which newsletters you chose, and we use our newsletter provider to send the emails. We never
          sell your address.
        </p>
      </section>
    </main>
  );
}
