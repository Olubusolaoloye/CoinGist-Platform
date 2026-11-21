import type { AuditLog, Role, StaffInvite, StaffInviteInput, StaffInviteOutcome, User, UserStatus } from "@coingist/types";
import { createAiRepository, type AiRepository } from "./ai.js";
import { createCommerceRepository, type CommerceRepository } from "./commerce.js";
import { createContentRepository, type ContentRepository } from "./content.js";
import { createInsightsRepository, type InsightsRepository } from "./insights.js";
import type { Database, SessionClaims } from "./database.js";
import { createNewsletterRepository, type NewsletterRepository } from "./newsletter.js";
import { createReaderRepository, type ReaderRepository } from "./readers.js";
import { createStudioRepository, type StudioRepository } from "./studio.js";
import { DomainError, mapDbError } from "./errors.js";

/**
 * Storage-agnostic data access used by the API. The API depends only on this interface;
 * swap the implementation (e.g. Convex) without touching route code.
 *
 * Methods that take `actor` run with the actor's permissions (RLS applies).
 * `findUserById` is the server's own lookup used for authorisation and runs privileged.
 */
export interface Repositories {
  ai: AiRepository;
  commerce: CommerceRepository;
  content: ContentRepository;
  insights: InsightsRepository;
  newsletter: NewsletterRepository;
  readers: ReaderRepository;
  studio: StudioRepository;
  users: {
    findById(id: string): Promise<User | null>;
    list(actor: SessionClaims, opts: { limit: number; offset: number }): Promise<User[]>;
    setRole(actor: SessionClaims, userId: string, role: Role): Promise<User>;
    setStatus(actor: SessionClaims, userId: string, status: UserStatus): Promise<User>;
    /** Admins only. An existing account gets the role now; otherwise it waits for their sign-up. */
    invite(actor: SessionClaims, input: StaffInviteInput): Promise<StaffInviteOutcome>;
    /** Open, unexpired invites, newest first. */
    listInvites(actor: SessionClaims): Promise<StaffInvite[]>;
    cancelInvite(actor: SessionClaims, id: string): Promise<void>;
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
    ai: createAiRepository(db),
    commerce: createCommerceRepository(db),
    content: createContentRepository(db),
    insights: createInsightsRepository(db),
    newsletter: createNewsletterRepository(db),
    readers: createReaderRepository(db),
    studio: createStudioRepository(db),
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

      invite: (actor, { email, role }) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query<{ outcome: StaffInviteOutcome }>(
              "select public.invite_staff($1, $2::public.user_role) as outcome",
              [email, role],
            );
            return rows[0]!.outcome;
          }),
        ),

      listInvites: (actor) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query<{ id: string; email: string; role: StaffInvite["role"]; invited_by: string | null; created_at: Date; expires_at: Date }>(
              `select id, email, role, invited_by, created_at, expires_at from public.staff_invites
               where accepted_at is null and expires_at > now() order by created_at desc`,
            );
            return rows.map((r) => ({
              id: r.id,
              email: r.email,
              role: r.role,
              invitedBy: r.invited_by,
              createdAt: new Date(r.created_at).toISOString(),
              expiresAt: new Date(r.expires_at).toISOString(),
            }));
          }),
        ),

      cancelInvite: (actor, id) =>
        run(
          db.asUser(actor, async (q) => {
            const rows = await q.query("delete from public.staff_invites where id = $1 and accepted_at is null returning id", [id]);
            if (!rows.length) throw new DomainError("not_found", "Invite not found");
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
