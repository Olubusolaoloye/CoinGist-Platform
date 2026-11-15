import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canTransition, POST_STATUSES, ROLES, type PostStatus, type Role } from "@coingist/types";
import { createTestDb, insertPost, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let users: Record<Role, TestUser>;
let otherWriter: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  users = {
    reader: await t.createUser(),
    writer: await t.createUser({ role: "writer" }),
    editor: await t.createUser({ role: "editor" }),
    admin: await t.createUser({ role: "admin" }),
  };
  otherWriter = await t.createUser({ role: "writer" });
});
afterAll(() => t.close());

const transition = (claims: TestUser["claims"], postId: string, to: PostStatus, at?: Date) =>
  t.db.asUser(claims, (q) =>
    q.query<{ status: string }>(
      "select status from public.transition_post($1, $2::public.post_status, $3)",
      [postId, to, at ?? null],
    ),
  );

describe("transition_post matches canTransition() for every role", () => {
  const cases = ROLES.flatMap((role) =>
    POST_STATUSES.flatMap((from) =>
      POST_STATUSES.filter((to) => to !== from).map((to) => ({ role, from, to })),
    ),
  );

  it.each(cases)("$role: $from -> $to", async ({ role, from, to }) => {
    const actor = users[role];
    // Writers act on their own posts; everyone else on someone else's (avoids self-approval rule).
    const authorId = role === "writer" ? actor.id : otherWriter.id;
    const postId = await insertPost(t.pg, { authorId, status: from, approverId: users.editor.id });
    const when = to === "scheduled" ? new Date(Date.now() + 3_600_000) : undefined;

    const expected = canTransition(role, from, to);
    const attempt = transition(actor.claims, postId, to, when);
    if (expected) {
      await expect(attempt).resolves.toEqual([{ status: to }]);
    } else {
      await expect(attempt).rejects.toThrow();
    }
  });
});

describe("workflow rules", () => {
  it("rejects every transition when staff have not passed 2FA", async () => {
    const postId = await insertPost(t.pg, { authorId: otherWriter.id, status: "in_review" });
    await expect(transition(users.editor.claimsNoMfa, postId, "approved")).rejects.toThrow(
      /not allowed/,
    );
  });

  it("stops writers submitting someone else's draft", async () => {
    const postId = await insertPost(t.pg, { authorId: otherWriter.id });
    await expect(transition(users.writer.claims, postId, "in_review")).rejects.toThrow(
      /not allowed/,
    );
  });

  it("stops editors approving their own post but lets admins", async () => {
    const editorPost = await insertPost(t.pg, { authorId: users.editor.id, status: "in_review" });
    await expect(transition(users.editor.claims, editorPost, "approved")).rejects.toThrow(
      /your own post/,
    );
    const adminPost = await insertPost(t.pg, { authorId: users.admin.id, status: "in_review" });
    await expect(transition(users.admin.claims, adminPost, "approved")).resolves.toEqual([
      { status: "approved" },
    ]);
  });

  it("records the human approver and writes an audit entry", async () => {
    const postId = await insertPost(t.pg, { authorId: otherWriter.id, status: "in_review" });
    await transition(users.editor.claims, postId, "approved");
    const post = await t.pg.query<{ approved_by: string }>(
      "select approved_by from public.posts where id = $1",
      [postId],
    );
    expect(post.rows[0]!.approved_by).toBe(users.editor.id);
    const audit = await t.pg.query<{ actor_id: string; metadata: { to: string } }>(
      "select actor_id, metadata from public.audit_logs where entity_id = $1",
      [postId],
    );
    expect(audit.rows).toEqual([{ actor_id: users.editor.id, metadata: { to: "approved", note: null } }]);
  });

  it("requires a future time to schedule", async () => {
    const postId = await insertPost(t.pg, { authorId: otherWriter.id, status: "approved" });
    await expect(
      transition(users.editor.claims, postId, "scheduled", new Date(Date.now() - 1000)),
    ).rejects.toThrow(/future/);
  });

  it("clears approval when a post is unpublished", async () => {
    const postId = await insertPost(t.pg, { authorId: otherWriter.id, status: "published" });
    await transition(users.editor.claims, postId, "draft");
    const res = await t.pg.query("select approved_by, approved_at from public.posts where id = $1", [
      postId,
    ]);
    expect(res.rows[0]).toEqual({ approved_by: null, approved_at: null });
  });

  it("lets the scheduler publish only scheduled posts that are due", async () => {
    const asScheduler = (postId: string, to: PostStatus) =>
      t.db.asService((q) =>
        q.query<{ status: string }>(
          "select status from public.transition_post($1, $2::public.post_status)",
          [postId, to],
        ),
      );
    const due = await insertPost(t.pg, { authorId: otherWriter.id, status: "scheduled" });
    await t.pg.query("update public.posts set scheduled_for = now() - interval '1 minute' where id = $1", [due]);
    await expect(asScheduler(due, "published")).resolves.toEqual([{ status: "published" }]);

    const notDue = await insertPost(t.pg, { authorId: otherWriter.id, status: "scheduled" });
    await expect(asScheduler(notDue, "published")).rejects.toThrow(/due scheduled/);

    const inReview = await insertPost(t.pg, { authorId: otherWriter.id, status: "in_review" });
    await expect(asScheduler(inReview, "approved")).rejects.toThrow(/due scheduled/);
  });
});
