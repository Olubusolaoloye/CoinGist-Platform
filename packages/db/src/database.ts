/**
 * Minimal database abstraction. Every query runs inside a transaction that has been
 * "logged in" as a specific Postgres role with Supabase-style JWT claims, so RLS applies
 * exactly as it would through PostgREST.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Verified claims from a Supabase access token. */
export interface SessionClaims {
  sub: string;
  email?: string | undefined;
  /** "aal2" once the user has passed a TOTP challenge in this session. */
  aal: "aal1" | "aal2";
}

export interface Database {
  /** Run as a signed-in user (role `authenticated`), or as `anon` when claims is null. */
  asUser<T>(claims: SessionClaims | null, fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run as `service_role` (bypasses RLS). Server-side only; never on behalf of a client. */
  asService<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Driver-specific part: run `fn` inside a single transaction. */
export type TransactionRunner = <T>(fn: (q: Queryable) => Promise<T>) => Promise<T>;

export function createDatabase(
  transaction: TransactionRunner,
  close: () => Promise<void>,
): Database {
  async function login(
    q: Queryable,
    role: "anon" | "authenticated" | "service_role",
    claims: Record<string, unknown>,
  ) {
    await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    // Role names are constants, never user input.
    await q.query(`set local role ${role}`);
  }

  return {
    asUser(claims, fn) {
      return transaction(async (q) => {
        if (claims) {
          await login(q, "authenticated", { ...claims, role: "authenticated" });
        } else {
          await login(q, "anon", { role: "anon" });
        }
        return fn(q);
      });
    },
    asService(fn) {
      return transaction(async (q) => {
        await login(q, "service_role", { role: "service_role" });
        return fn(q);
      });
    },
    close,
  };
}
