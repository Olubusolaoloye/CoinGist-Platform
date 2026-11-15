/**
 * Local API with no external services: in-memory Postgres (PGlite) + sample content.
 * Adds dev-only sign-in endpoints for Studio. Data resets on every start.
 * Never run this in production.
 */
import { serve } from "@hono/node-server";
import { SignJWT } from "jose";
import { createPgRepositories, publishDueScheduled } from "@coingist/db";
import { seedDevData } from "@coingist/db/dev-seed";
import { createPgliteDatabase } from "@coingist/db/pglite";
import { createApp } from "./app.js";
import { createTokenVerifier } from "./auth.js";

if (process.env["NODE_ENV"] === "production") {
  throw new Error("dev.ts must not run in production");
}

export const DEV_SUPABASE_URL = "http://localhost:54321";
export const DEV_JWT_SECRET = "local-dev-secret-not-for-production-use";

const port = Number(process.env["PORT"] ?? 8787);
const { pg, db } = await createPgliteDatabase();
await seedDevData(pg);

const app = createApp({
  repos: createPgRepositories(db),
  verifyToken: createTokenVerifier({ supabaseUrl: DEV_SUPABASE_URL, jwtSecret: DEV_JWT_SECRET }),
  corsOrigins: ["http://localhost:5173", "http://localhost:5174"],
});

/** Seeded accounts the dev sign-in page offers. */
app.get("/dev/users", async (c) => {
  const res = await pg.query<{ email: string; name: string; role: string }>(
    "select email, name, role from public.users order by role desc, name",
  );
  return c.json({ users: res.rows });
});

/** Mint an MFA-verified access token for a seeded user, like Supabase would after TOTP. */
app.post("/dev/token", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: unknown; aal?: unknown };
  const res = await pg.query<{ id: string; email: string }>(
    "select id, email from public.users where lower(email) = lower($1)",
    [String(body.email ?? "")],
  );
  const user = res.rows[0];
  if (!user) return c.json({ error: { code: "not_found", message: "No such user" } }, 404);
  const accessToken = await new SignJWT({
    role: "authenticated",
    aal: body.aal === "aal1" ? "aal1" : "aal2",
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("authenticated")
    .setIssuer(`${DEV_SUPABASE_URL}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(DEV_JWT_SECRET));
  return c.json({ accessToken, expiresIn: 8 * 3600 });
});

// Local stand-in for the production cron: publish due scheduled posts every minute.
setInterval(() => {
  void publishDueScheduled(db).then((ids) => {
    if (ids.length) console.log(`scheduler: published ${ids.length} post(s)`);
  });
}, 60_000).unref();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api (local, seeded PGlite) on http://localhost:${info.port}`);
});
