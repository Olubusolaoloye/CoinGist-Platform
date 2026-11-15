import pg from "pg";
import { createDatabase, type Database } from "./database.js";

/** Production driver (node-postgres). Use the Supabase pooler connection string. */
export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10 });

  return createDatabase(
    async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
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
