import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  DisplayNameSchema,
  FOLLOW_TYPES,
  FollowInputSchema,
  isStaff,
  NewCommentSchema,
  ReportCommentSchema,
  ROLE_PERMISSIONS,
} from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requireUser } from "../middleware.js";

const PostId = z.object({ postId: z.string().uuid() });
const CommentId = z.object({ id: z.string().uuid() });
const Page = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * The signed-in person's own account: profile, saved stories, follows and personalised feed.
 * Any active account (readers and staff); reader features don't need 2FA.
 */
export const meRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "private, no-store");
  })
  .use("*", requireUser)
  .get("/", (c) => {
    const user = c.var.user!;
    const mfaVerified = c.var.claims?.aal === "aal2";
    return c.json({
      user,
      permissions: [...ROLE_PERMISSIONS[user.role]],
      mfaVerified,
      // Studio sends staff to TOTP enrolment/challenge when this is true.
      mfaRequired: isStaff(user.role) && !mfaVerified,
    });
  })
  .get("/state", zValidator("query", z.object({ postId: z.string().uuid().optional() })), async (c) =>
    c.json(await c.var.repos.readers.state(c.var.claims!, c.req.valid("query").postId ?? null)),
  )
  .get("/feed", zValidator("query", Page), async (c) => c.json(await c.var.repos.readers.feed(c.var.claims!, c.req.valid("query"))))
  .get("/bookmarks", zValidator("query", Page), async (c) =>
    c.json(await c.var.repos.readers.listBookmarks(c.var.claims!, c.req.valid("query"))),
  )
  .put("/bookmarks/:postId", zValidator("param", PostId), async (c) => {
    await c.var.repos.readers.addBookmark(c.var.claims!, c.req.valid("param").postId);
    return c.body(null, 204);
  })
  .delete("/bookmarks/:postId", zValidator("param", PostId), async (c) => {
    await c.var.repos.readers.removeBookmark(c.var.claims!, c.req.valid("param").postId);
    return c.body(null, 204);
  })
  .get("/follows", async (c) => c.json({ follows: await c.var.repos.readers.listFollows(c.var.claims!) }))
  .put("/follows", zValidator("json", FollowInputSchema), async (c) =>
    c.json({ follow: await c.var.repos.readers.follow(c.var.claims!, c.req.valid("json")) }),
  )
  .delete("/follows/:type/:slug", zValidator("param", z.object({ type: z.enum(FOLLOW_TYPES), slug: z.string().max(120) })), async (c) => {
    const { type, slug } = c.req.valid("param");
    await c.var.repos.readers.unfollow(c.var.claims!, { type, slug });
    return c.body(null, 204);
  })
  // Comments and likes. The database checks the story is published and the account active.
  .get("/posts/:postId/engagement", zValidator("param", PostId), async (c) =>
    c.json(await c.var.repos.engagement.mine(c.var.claims!, c.req.valid("param").postId)),
  )
  .post("/posts/:postId/comments", zValidator("param", PostId), zValidator("json", NewCommentSchema), async (c) => {
    const { body, parentId } = c.req.valid("json");
    return c.json({ id: await c.var.repos.engagement.addComment(c.var.claims!, c.req.valid("param").postId, body, parentId) }, 201);
  })
  .patch("/comments/:id", zValidator("param", CommentId), zValidator("json", NewCommentSchema.pick({ body: true })), async (c) => {
    await c.var.repos.engagement.editComment(c.var.claims!, c.req.valid("param").id, c.req.valid("json").body);
    return c.body(null, 204);
  })
  .delete("/comments/:id", zValidator("param", CommentId), async (c) => {
    await c.var.repos.engagement.deleteComment(c.var.claims!, c.req.valid("param").id);
    return c.body(null, 204);
  })
  .put("/posts/:postId/like", zValidator("param", PostId), async (c) =>
    c.json({ likes: await c.var.repos.engagement.likePost(c.var.claims!, c.req.valid("param").postId, true) }),
  )
  .delete("/posts/:postId/like", zValidator("param", PostId), async (c) =>
    c.json({ likes: await c.var.repos.engagement.likePost(c.var.claims!, c.req.valid("param").postId, false) }),
  )
  .put("/comments/:id/like", zValidator("param", CommentId), async (c) =>
    c.json({ likes: await c.var.repos.engagement.likeComment(c.var.claims!, c.req.valid("param").id, true) }),
  )
  .delete("/comments/:id/like", zValidator("param", CommentId), async (c) =>
    c.json({ likes: await c.var.repos.engagement.likeComment(c.var.claims!, c.req.valid("param").id, false) }),
  )
  .post("/comments/:id/report", zValidator("param", CommentId), zValidator("json", ReportCommentSchema), async (c) => {
    await c.var.repos.engagement.report(c.var.claims!, c.req.valid("param").id, c.req.valid("json").reason);
    return c.body(null, 204);
  })
  .patch("/profile", zValidator("json", DisplayNameSchema), async (c) => {
    await c.var.repos.engagement.setDisplayName(c.var.claims!, c.req.valid("json").name);
    return c.body(null, 204);
  })
  // Deactivate (readers only). Nothing is deleted; signing in again reactivates the account.
  .post("/deactivate", async (c) => {
    await c.var.repos.readers.deactivate(c.var.claims!);
    return c.body(null, 204);
  });
