import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createDatabase, type Database } from "./database.js";

const here = dirname(fileURLToPath(import.meta.url));
const SHIM = join(here, "../dev/supabase-shim.sql");
const MIGRATIONS_DIR = join(here, "../../../supabase/migrations");

async function readSqlFiles() {
  const names = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  return {
    shim: await readFile(SHIM, "utf8"),
    migrations: await Promise.all(
      names.map(async (name) => ({ name, sql: await readFile(join(MIGRATIONS_DIR, name), "utf8") })),
    ),
  };
}

/**
 * In-process Postgres (WASM) for tests and local development without Supabase.
 * Applies a small Supabase stand-in (auth schema, API roles) and then every migration.
 * Never used in production.
 */
export async function createPgliteDatabase(
  opts: {
    dataDir?: string;
    /** SQL as strings instead of reading files (for serverless bundles). */
    sql?: { shim: string; migrations: Array<{ name: string; sql: string }> };
  } = {},
): Promise<{
  pg: PGlite;
  db: Database;
  fresh: boolean;
}> {
  const pg = new PGlite(opts.dataDir);
  const existing = await pg.query<{ n: number }>(
    "select count(*)::int n from pg_namespace where nspname = 'auth'",
  );
  const fresh = existing.rows[0]!.n === 0;

  if (fresh) {
    const sql = opts.sql ?? (await readSqlFiles());
    await pg.exec(sql.shim);
    for (const m of sql.migrations) {
      try {
        await pg.exec(m.sql);
      } catch (err) {
        throw new Error(`migration ${m.name} failed: ${(err as Error).message}`);
      }
    }
  }

  const db = createDatabase(
    (fn) =>
      pg.transaction(async (tx) =>
        fn({ query: async (sql, params) => (await tx.query(sql, params)).rows as never[] }),
      ),
    () => pg.close(),
  );
  return { pg, db, fresh };
}
