import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createDatabase, type Database } from "./database.js";

const here = dirname(fileURLToPath(import.meta.url));
const SHIM = join(here, "../dev/supabase-shim.sql");
const MIGRATIONS_DIR = join(here, "../../../supabase/migrations");

/**
 * In-process Postgres (WASM) for tests and local development without Supabase.
 * Applies a small Supabase stand-in (auth schema, API roles) and then every migration.
 * Never used in production.
 */
export async function createPgliteDatabase(opts: { dataDir?: string } = {}): Promise<{
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
    await pg.exec(await readFile(SHIM, "utf8"));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      try {
        await pg.exec(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
      } catch (err) {
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
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
