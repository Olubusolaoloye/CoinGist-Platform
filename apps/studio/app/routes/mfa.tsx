import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/mfa";
import { Wordmark } from "~/components/Wordmark";
import { safeNext } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/csrf.server";
import { env } from "~/lib/env.server";
import { studioHeaders } from "~/lib/headers";
import { supabaseForRequest } from "~/lib/supabase.server";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "Two-factor verification | CoinGist Studio" }];
}

/**
 * TOTP step. First visit enrols an authenticator app (QR code); later visits ask for a code.
 * A verified code upgrades the session to aal2, which the API and RLS require for staff.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (env.authMode !== "supabase") throw redirect(next);

  const { client, headers } = supabaseForRequest(request);
  const { data: session } = await client.auth.getSession();
  if (!session.session) throw redirect("/login", { headers });

  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") throw redirect(next, { headers });

  const { data: factors } = await client.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");
  if (verified) return data({ next, mode: "challenge" as const, factorId: verified.id, qr: null, secret: null }, { headers });

  // Clear abandoned enrolments so they don't pile up, then start a fresh one.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await client.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: enrol, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "CoinGist Studio" });
  if (error || !enrol) throw data({ error: "Couldn't start 2FA setup. Refresh to try again." }, { status: 502, headers });
  return data(
    { next, mode: "enroll" as const, factorId: enrol.id, qr: enrol.totp.qr_code, secret: enrol.totp.secret },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await request.formData();
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(form.get("factorId") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  if (!/^\d{6}$/.test(code)) return data({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });

  const { client, headers } = supabaseForRequest(request);
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return data({ error: "That code didn't work. Codes change every 30 seconds; try the current one." }, { status: 400, headers });
  return redirect(next, { headers });
}

export default function Mfa({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const { mode, qr, secret, factorId, next } = loaderData;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Wordmark />
      <h1 className="mt-6 font-display text-3xl font-extrabold">
        {mode === "enroll" ? "Set up two-factor sign-in" : "Enter your 2FA code"}
      </h1>
      {mode === "enroll" ? (
        <>
          <p className="mt-2 text-muted">
            Studio requires an authenticator app (Google Authenticator, 1Password, Authy and similar). Scan this
            code, then enter the 6-digit code it shows.
          </p>
          {qr ? <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="mt-4 rounded-md bg-white p-2" /> : null}
          {secret ? (
            <p className="mt-3 text-sm">
              Can't scan? Enter this key: <code className="rounded bg-line px-1.5 py-0.5 break-all">{secret}</code>
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-muted">Open your authenticator app and enter the current code for CoinGist Studio.</p>
      )}
      <Form method="post" className="mt-6 space-y-3">
        <input type="hidden" name="factorId" value={factorId} />
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="code" className="label">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className="field text-lg tracking-widest" />
        </div>
        {actionData && "error" in actionData ? <p role="alert" className="text-sm text-bad">{actionData.error}</p> : null}
        <button className="btn btn-primary w-full" disabled={busy}>Verify</button>
      </Form>
    </main>
  );
}
