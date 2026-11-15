import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Role } from "@coingist/types";
import { createDatabase, type Database, type SessionClaims } from "../src/database.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "../../../supabase/migrations");

export interface TestDb {
  /** Superuser connection: bypasses RLS and grants. Use only for fixtures and assertions. */
  pg: PGlite;
  db: Database;
  createUser(opts?: { role?: Role; email?: string; name?: string }): Promise<TestUser>;
  close(): Promise<void>;
}

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  /** Claims for an MFA-verified session. */
  claims: SessionClaims;
  /** Claims for a password/magic-link-only session (no TOTP yet). */
  claimsNoMfa: SessionClaims;
}

/** Fresh in-memory Postgres with the Supabase shim and every migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(await readFile(join(here, "supabase-shim.sql"), "utf8"));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await pg.exec(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (err) {
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    }
  }

  const db = createDatabase(
    (fn) =>
      pg.transaction(async (tx) =>
        fn({ query: async (sql, params) => (await tx.query(sql, params)).rows as never[] }),
      ),
    async () => {},
  );

  let n = 0;
  return {
    pg,
    db,
    async createUser({ role = "reader", email, name } = {}) {
      n += 1;
      const mail = email ?? `${role}${n}@test.coingist.local`;
      const res = await pg.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
        [mail, JSON.stringify({ full_name: name ?? `${role} ${n}` })],
      );
      const id = res.rows[0]!.id;
      if (role !== "reader") {
        await pg.query("update public.users set role = $1 where id = $2", [role, id]);
      }
      return {
        id,
        email: mail,
        role,
        claims: { sub: id, email: mail, aal: "aal2" },
        claimsNoMfa: { sub: id, email: mail, aal: "aal1" },
      };
    },
    close: () => pg.close(),
  };
}

let slugSeq = 0;

/** Insert a post in any state as superuser (fixtures only; bypasses the workflow). */
export async function insertPost(
  pg: PGlite,
  opts: {
    authorId: string;
    status?: import("@coingist/types").PostStatus;
    approverId?: string;
    title?: string;
    publishedAt?: Date;
  },
): Promise<string> {
  const status = opts.status ?? "draft";
  const needsApproval = ["approved", "scheduled", "published"].includes(status);
  slugSeq += 1;
  const res = await pg.query<{ id: string }>(
    `insert into public.posts
       (type, title, slug, author_id, status, approved_by, approved_at, scheduled_for, published_at)
     values ('news', $1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      opts.title ?? `Post ${slugSeq}`,
      `post-${slugSeq}-${Math.random().toString(36).slice(2, 8)}`,
      opts.authorId,
      status,
      needsApproval ? (opts.approverId ?? opts.authorId) : null,
      needsApproval ? new Date() : null,
      status === "scheduled" ? new Date(Date.now() + 86_400_000) : null,
      status === "published" ? (opts.publishedAt ?? new Date(Date.now() - 60_000)) : null,
    ],
  );
  return res.rows[0]!.id;
}
