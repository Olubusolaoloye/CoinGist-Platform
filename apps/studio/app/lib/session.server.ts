import { createCookieSessionStorage } from "react-router";
import { env } from "./env.server";

/** Dev-mode session: holds the access token minted by the local API. */
export const devSession = createCookieSessionStorage<{ accessToken: string }>({
  cookie: {
    name: "cg_studio_dev",
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: 8 * 3600,
    secrets: [env.sessionSecret || "dev-only-session-secret-change-me"],
  },
});
