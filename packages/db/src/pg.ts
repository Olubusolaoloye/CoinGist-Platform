import pg from "pg";
import { createDatabase, type Database } from "./database.js";

/** Production driver (node-postgres). Use the Supabase pooler connection string. */
export function createPgDatabase(connectionString: string, opts: { max?: number } = {}): Database {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10 });

  return createDatabase(
    async (fn, setup) => {
      const client = await pool.connect();
      try {
        // One round trip: begin plus the login statements (simple query protocol, no params).
        await client.query(`begin; ${setup}`);
        const result = await fn({
          query: async (sql, params) => (await client.query(sql, params)).rows,
        });
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    () => pool.end(),
  );
}
