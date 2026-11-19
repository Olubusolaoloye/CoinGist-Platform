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

/**
 * Driver-specific part: run `fn` inside a single transaction, after running `setup` (plain SQL,
 * no parameters) at its start. Drivers send `begin` and `setup` together in one round trip.
 */
export type TransactionRunner = <T>(fn: (q: Queryable) => Promise<T>, setup: string) => Promise<T>;

/** A SQL string literal (standard_conforming_strings is on in every supported Postgres). */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function createDatabase(
  transaction: TransactionRunner,
  close: () => Promise<void>,
): Database {
  /**
   * "Log in" for the rest of the transaction: JWT claims for RLS, then the API role. One
   * statement batch, sent with `begin`, so it costs no extra round trip to the database.
   */
  function login(role: "anon" | "authenticated" | "service_role", claims: Record<string, unknown>): string {
    // Role names are constants, never user input; claims are escaped as a string literal.
    return `select set_config('request.jwt.claims', ${literal(JSON.stringify(claims))}, true); set local role ${role};`;
  }

  return {
    asUser(claims, fn) {
      const setup = claims
        ? login("authenticated", { ...claims, role: "authenticated" })
        : login("anon", { role: "anon" });
      return transaction(fn, setup);
    },
    asService(fn) {
      return transaction(fn, login("service_role", { role: "service_role" }));
    },
    close,
  };
}
