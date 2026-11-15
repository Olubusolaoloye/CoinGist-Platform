import type { AuditLog, Role, User, UserStatus } from "@coingist/types";
import { createContentRepository, type ContentRepository } from "./content.js";
import type { Database, SessionClaims } from "./database.js";
import { mapDbError } from "./errors.js";

/**
 * Storage-agnostic data access used by the API. The API depends only on this interface;
 * swap the implementation (e.g. Convex) without touching route code.
 *
 * Methods that take `actor` run with the actor's permissions (RLS applies).
 * `findUserById` is the server's own lookup used for authorisation and runs privileged.
 */
export interface Repositories {
  content: ContentRepository;
  users: {
    findById(id: string): Promise<User | null>;
    list(actor: SessionClaims, opts: { limit: number; offset: number }): Promise<User[]>;
    setRole(actor: SessionClaims, userId: string, role: Role): Promise<User>;
    setStatus(actor: SessionClaims, userId: string, status: UserStatus): Promise<User>;
  };
  audit: {
    list(
      actor: SessionClaims,
      opts: { limit: number; entity?: string | undefined; entityId?: string | undefined },
    ): Promise<AuditLog[]>;
  };
}

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: Role;
  status: UserStatus;
  two_factor_enabled: boolean;
  created_at: Date | string;
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  avatarUrl: r.avatar_url,
  role: r.role,
  status: r.status,
  twoFactorEnabled: r.two_factor_enabled,
  createdAt: iso(r.created_at),
});

const toAudit = (r: AuditRow): AuditLog => ({
  id: r.id,
  actorId: r.actor_id,
  action: r.action,
  entity: r.entity,
  entityId: r.entity_id,
  metadata: r.metadata,
  createdAt: iso(r.created_at),
});

const USER_COLS = "id, email, name, avatar_url, role, status, two_factor_enabled, created_at";

export function createPgRepositories(db: Database): Repositories {
  const run = async <T>(p: Promise<T>): Promise<T> => p.catch(mapDbError);

  return {
    content: createContentRepository(db),
    users: {
      findById: (id) =>
        run(
          db.asService(async (q) => {
            const rows = await q.query<UserRow>(
              `select ${USER_COLS} from public.users where id = $1`,
              [id],
            );
            return rows[0] ? toUser(rows[0]) : null;
          }),
        ),

      list: (actor, { limit, offset }) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query<UserRow>(
              `select ${USER_COLS} from public.users
               order by created_at desc limit $1 offset $2`,
              [limit, offset],
            );
            return rows.map(toUser);
          }),
        ),

      setRole: (actor, userId, role) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query<UserRow>(
              `select ${USER_COLS} from public.set_user_role($1, $2::public.user_role)`,
              [userId, role],
            );
            return toUser(rows[0]!);
          }),
        ),

      setStatus: (actor, userId, status) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query<UserRow>(
              `select ${USER_COLS} from public.set_user_status($1, $2::public.user_status)`,
              [userId, status],
            );
            return toUser(rows[0]!);
          }),
        ),
    },

    audit: {
      list: (actor, { limit, entity, entityId }) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query<AuditRow>(
              `select id, actor_id, action, entity, entity_id, metadata, created_at
               from public.audit_logs
               where ($2::text is null or entity = $2)
                 and ($3::text is null or entity_id = $3)
               order by created_at desc
               limit $1`,
              [limit, entity ?? null, entityId ?? null],
            );
            return rows.map(toAudit);
          }),
        ),
    },
  };
}
