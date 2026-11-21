import { readForm } from "~/lib/form.server";
import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/account.login";
import { apiUrl, siteConfig } from "~/lib/config.server";
import { privateHeaders } from "~/lib/private.server";
import { allow, clientIp } from "~/lib/ratelimit.server";
import { assertSameOrigin, getReader, readerAuthMode, safeNext, signInWithToken, supabaseFor } from "~/lib/reader.server";

export const headers = ({ loaderHeaders, actionHeaders }: Route.HeadersArgs) => (actionHeaders.has("Cache-Control") ? actionHeaders : loaderHeaders);

export function meta() {
  return [{ title: "Sign in | CoinGist" }, { name: "robots", content: "noindex" }];
}

type DevUser = { email: string; name: string; role: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  if (await getReader(request)) throw redirect(next, { headers: privateHeaders() });
  const mode = readerAuthMode();
  let devUsers: DevUser[] = [];
  if (mode === "dev") {
    const res = await fetch(`${apiUrl()}/dev/users`).catch(() => null);
    const all = res?.ok ? ((await res.json()) as { users: DevUser[] }).users : [];
    // Readers first: this is the public site.
    devUsers = [...all.filter((u) => u.role === "reader"), ...all.filter((u) => u.role !== "reader")];
  }
  return data(
    { mode, next, devUsers, expired: url.searchParams.has("expired"), error: url.searchParams.get("error") },
    { headers: privateHeaders() },
  );
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const next = safeNext(String(form.get("next") ?? ""));
  const mode = readerAuthMode();
  if (!allow(`reader-login:${clientIp(request)}`, Number(process.env["READER_SIGNINS_PER_10_MIN"] ?? 10), 10 * 60_000)) {
    return data({ error: "Too many attempts. Try again in a few minutes.", sent: false }, { status: 429, headers: privateHeaders() });
  }

  if (mode === "off") return data({ error: "Reader accounts aren't available yet.", sent: false }, { status: 503, headers: privateHeaders() });
  if (mode === "demo") {
    const { createDemoReader } = await import("~/lib/demo-api.server");
    return signInWithToken(await createDemoReader(), next);
  }
  if (mode === "dev") {
    const res = await fetch(`${apiUrl()}/dev/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), aal: "aal1" }),
    });
    if (!res.ok) return data({ error: "That account doesn't exist in the local database.", sent: false }, { status: 400, headers: privateHeaders() });
    return signInWithToken(((await res.json()) as { accessToken: string }).accessToken, next);
  }

  const { client, headers } = supabaseFor(request);
  const callback = `${siteConfig().url}/account/callback?next=${encodeURIComponent(next)}`;
  if (form.get("intent") === "google") {
    const { data: oauth, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback } });
    if (error || !oauth.url) return data({ error: "Google sign-in isn't available right now.", sent: false }, { status: 502, headers: privateHeaders(headers) });
    return redirect(oauth.url, { headers: privateHeaders(headers) });
  }
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return data({ error: "Enter a valid email address.", sent: false }, { status: 400, headers: privateHeaders() });
  }
  // Readers can create an account by signing in. Same answer whether or not it already exists.
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: callback, shouldCreateUser: true } });
  if (error && error.status !== 400 && error.status !== 422) {
    return data({ error: "We couldn't send the email. Try again in a minute.", sent: false }, { status: 502, headers: privateHeaders(headers) });
  }
  return data({ error: null, sent: true }, { headers: privateHeaders(headers) });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { mode, next, devUsers, expired, error } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Sign in</h1>
      <p className="mt-2 text-lg text-muted">Save stories to read later, follow writers and topics, and get a feed made for you. Free.</p>
      {expired ? <p className="mt-4 rounded-md border border-warn p-3 text-sm">Your session ended. Sign in again to continue.</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-md border border-bad p-3 text-sm">That sign-in link didn't work. It may have expired; try again.</p> : null}
      {actionData?.error ? <p role="alert" className="mt-4 rounded-md border border-bad p-3 text-sm">{actionData.error}</p> : null}

      {mode === "off" ? (
        <p className="mt-6 rounded-md border border-line p-4">Reader accounts are coming soon. In the meantime, get the Daily Gist by email from the newsletter page.</p>
      ) : mode === "supabase" ? (
        actionData?.sent ? (
          <p role="status" className="mt-6 rounded-md border border-ok p-4">Check your inbox. We've sent a sign-in link; it works once and expires in an hour.</p>
        ) : (
          <div className="mt-6 space-y-6">
            <Form method="post" className="space-y-3">
              <input type="hidden" name="next" value={next} />
              <label htmlFor="email" className="block font-semibold">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" required className="w-full rounded-md border border-line bg-surface px-3 py-2.5" />
              <button className="w-full rounded-md bg-ink px-4 py-3 font-semibold text-paper hover:opacity-90 disabled:opacity-60" disabled={busy}>Email me a sign-in link</button>
            </Form>
            <Form method="post">
              <input type="hidden" name="next" value={next} />
              <button name="intent" value="google" className="w-full rounded-md border border-line px-4 py-3 font-semibold hover:border-ink" disabled={busy}>Continue with Google</button>
            </Form>
          </div>
        )
      ) : mode === "demo" ? (
        <Form method="post" className="mt-6 space-y-3">
          <input type="hidden" name="next" value={next} />
          <p className="rounded-md border border-line p-3 text-sm">This is a preview. You'll get a temporary demo account; what you save may disappear when the preview restarts.</p>
          <button className="w-full rounded-md bg-ink px-4 py-3 font-semibold text-paper hover:opacity-90" disabled={busy}>Try it with a demo account</button>
        </Form>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-muted">Local development: choose an account from the sample database.</p>
          <ul className="mt-3 space-y-2">
            {devUsers.map((u) => (
              <li key={u.email}>
                <Form method="post">
                  <input type="hidden" name="next" value={next} />
                  <input type="hidden" name="email" value={u.email} />
                  <button className="w-full rounded-md border border-line px-4 py-3 text-left hover:border-ink" disabled={busy}>
                    Sign in as {u.name} <span className="text-sm text-muted capitalize">({u.role})</span>
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-8 text-sm text-muted">
        We use your email only to sign you in. Your saved stories and follows are private to you. Newsletters are separate; sign up on the newsletter page.
      </p>
    </main>
  );
}
