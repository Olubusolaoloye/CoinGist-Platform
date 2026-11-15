import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { Wordmark } from "~/components/Wordmark";
import { getAuth, safeNext } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/csrf.server";
import { env } from "~/lib/env.server";
import { studioHeaders } from "~/lib/headers";
import { devSession } from "~/lib/session.server";
import { supabaseForRequest } from "~/lib/supabase.server";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "Sign in | CoinGist Studio" }];
}

type DevUser = { email: string; name: string; role: string };

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  if (await getAuth(request)) throw redirect(next);

  let devUsers: DevUser[] = [];
  if (env.authMode === "dev") {
    const res = await fetch(`${env.apiUrl}/dev/users`).catch(() => null);
    devUsers = res?.ok ? ((await res.json()) as { users: DevUser[] }).users : [];
  }
  return {
    mode: env.authMode,
    next,
    devUsers,
    expired: url.searchParams.has("expired"),
    error: url.searchParams.get("error"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));

  if (env.authMode === "dev") {
    const res = await fetch(`${env.apiUrl}/dev/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    });
    if (!res.ok) return data({ error: "That account doesn't exist in the local database." }, { status: 400 });
    const { accessToken } = (await res.json()) as { accessToken: string };
    const session = await devSession.getSession();
    session.set("accessToken", accessToken);
    return redirect(next, { headers: { "Set-Cookie": await devSession.commitSession(session) } });
  }

  const { client, headers } = supabaseForRequest(request);
  const callback = `${env.studioUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  if (form.get("intent") === "google") {
    const { data: oauth, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback },
    });
    if (error || !oauth.url) return data({ error: "Google sign-in isn't available right now." }, { status: 502, headers });
    return redirect(oauth.url, { headers });
  }

  const email = String(form.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return data({ error: "Enter a valid email address." }, { status: 400 });
  }
  // shouldCreateUser: false — Studio never creates accounts. Staff are invited by an admin.
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback, shouldCreateUser: false },
  });
  // Same response whether or not the address exists, so the form can't be used to probe accounts.
  if (error && error.status !== 400 && error.status !== 422) {
    return data({ error: "We couldn't send the email. Try again in a minute." }, { status: 502, headers });
  }
  return data({ sent: email }, { headers });
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { mode, next, devUsers, expired, error } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as { error?: string; sent?: string } | undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Wordmark />
      <h1 className="mt-6 font-display text-3xl font-extrabold">Sign in</h1>
      <p className="mt-2 text-muted">For CoinGist writers, editors and admins.</p>

      {expired ? <p role="alert" className="mt-4 rounded-md border border-warn p-3 text-sm">Your session ended. Sign in again to continue.</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-md border border-bad p-3 text-sm">That sign-in link didn't work. It may have expired. Request a new one.</p> : null}
      {result?.error ? <p role="alert" className="mt-4 rounded-md border border-bad p-3 text-sm">{result.error}</p> : null}

      {mode === "dev" ? (
        <section className="mt-6">
          <p className="rounded-md bg-gist p-3 text-sm text-gist-ink">
            <strong>Local development sign-in.</strong> Pick a seeded account. Sessions are treated as
            2FA-verified. This page does not exist in production.
          </p>
          <ul className="mt-4 space-y-2">
            {devUsers.map((u) => (
              <li key={u.email}>
                <Form method="post">
                  <input type="hidden" name="email" value={u.email} />
                  <input type="hidden" name="next" value={next} />
                  <button className="btn w-full justify-between" disabled={busy}>
                    <span>Sign in as {u.name}</span>
                    <span className="text-sm font-normal text-muted">{u.role}</span>
                  </button>
                </Form>
              </li>
            ))}
          </ul>
          {devUsers.length === 0 ? <p className="mt-4 text-sm text-muted">Start the local API (pnpm dev:local) to see accounts.</p> : null}
        </section>
      ) : result?.sent ? (
        <p role="status" className="mt-6 panel">
          If <strong>{result.sent}</strong> has a Studio account, a sign-in link is on its way. Open it on this device.
        </p>
      ) : (
        <section className="mt-6 space-y-4">
          <Form method="post" className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="email" className="label">Work email</label>
              <input id="email" name="email" type="email" autoComplete="email" required className="field" />
            </div>
            <button className="btn btn-primary w-full" disabled={busy}>Email me a sign-in link</button>
          </Form>
          <Form method="post">
            <input type="hidden" name="next" value={next} />
            <button name="intent" value="google" className="btn w-full" disabled={busy}>Continue with Google</button>
          </Form>
          <p className="hint">You'll confirm with your authenticator app after signing in.</p>
        </section>
      )}
    </main>
  );
}
