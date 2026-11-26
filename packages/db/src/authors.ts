import type { AuthorProfileInput, Role, StaffAuthor } from "@coingist/types";
import type { Database, SessionClaims } from "./database.js";
import { mapDbError } from "./errors.js";

export interface AuthorsRepository {
  /** Editors and up: every staff member. Writers: just themselves. */
  list(actor: SessionClaims): Promise<StaffAuthor[]>;
  /** Your own profile (writers and up) or anyone's (editors and up). Returns the profile's slug. */
  saveProfile(actor: SessionClaims, userId: string, input: AuthorProfileInput): Promise<string>;
  /** Editors and up: credit a story to another staff member. */
  setPostAuthor(actor: SessionClaims, postId: string, authorId: string): Promise<void>;
}

type Row = {
  id: string; email: string; role: Role; name: string | null; avatar_url: string | null;
  slug: string | null; title: string | null; bio: string | null; socials: StaffAuthor["socials"] | null; expertise: string[] | null;
};

export function createAuthorsRepository(db: Database): AuthorsRepository {
  const run = <T>(p: Promise<T>) => p.catch(mapDbError);
  return {
    list: (actor) =>
      run(
        db.asUser(actor, async (q) => {
          const rows = await q.query<Row>(
            `select u.id, u.email, u.role, u.name, u.avatar_url, ap.slug, ap.title, ap.bio, ap.socials, ap.expertise
             from public.users u left join public.author_profiles ap on ap.user_id = u.id
             where u.role <> 'reader' and u.status = 'active'
               and (public.staff_at_least('editor') or u.id = $1)
             order by lower(coalesce(u.name, u.email))`,
            [actor.sub],
          );
          return rows.map((r) => ({
            id: r.id,
            email: r.email,
            role: r.role,
            name: r.name,
            avatarUrl: r.avatar_url,
            slug: r.slug,
            title: r.title,
            bio: r.bio,
            socials: r.socials ?? {},
            expertise: r.expertise ?? [],
          }));
        }),
      ),

    saveProfile: (actor, userId, input) =>
      run(
        db.asUser(actor, async (q) => {
          // Drop empty social links so the public page only shows real ones.
          const socials = Object.fromEntries(Object.entries(input.socials).filter(([, v]) => v));
          const rows = await q.query<{ slug: string }>(
            "select public.save_author_profile($1, $2, $3, $4, $5, $6::jsonb, $7::text[]) as slug",
            [userId, input.name, input.avatarUrl, input.title, input.bio, JSON.stringify(socials), input.expertise],
          );
          return rows[0]!.slug;
        }),
      ),

    setPostAuthor: (actor, postId, authorId) =>
      run(
        db.asUser(actor, async (q) => {
          await q.query("select public.set_post_author($1, $2)", [postId, authorId]);
        }),
      ),
  };
}
