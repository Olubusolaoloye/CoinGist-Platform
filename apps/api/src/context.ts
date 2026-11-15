import type { Repositories, SessionClaims } from "@coingist/db";
import type { User } from "@coingist/types";

export type AppEnv = {
  Variables: {
    repos: Repositories;
    /** Verified token claims, or null for anonymous requests. */
    claims: SessionClaims | null;
    /** The caller's current DB record (role is read from here, never from the token). */
    user: User | null;
  };
};
