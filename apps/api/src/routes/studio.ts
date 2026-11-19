import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  CalendarQuerySchema,
  CommentInputSchema,
  CreatePostInputSchema,
  PostStatusSchema,
  TransitionInputSchema,
  UpdatePostInputSchema,
} from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requirePermission } from "../middleware.js";

const Id = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  status: PostStatusSchema.optional(),
  mine: z.enum(["true", "false"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const NOT_FOUND = { error: { code: "not_found", message: "Not found" } } as const;

/** Every Studio route: staff only, MFA-verified session, permission checked per route. */
export const studioRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  })
  .get("/dashboard", requirePermission("post:review"), zValidator("query", CalendarQuerySchema), async (c) =>
    c.json({ dashboard: await c.var.repos.insights.editorDashboard(c.var.claims!, { from: c.req.valid("query").from }) }),
  )
  .get("/earnings", requirePermission("payments:view_own"), async (c) =>
    c.json({ earnings: await c.var.repos.insights.myEarnings(c.var.claims!) }),
  )
  .get("/posts", requirePermission("post:create"), zValidator("query", ListQuery), async (c) => {
    const q = c.req.valid("query");
    const list = await c.var.repos.studio.listPosts(c.var.claims!, {
      status: q.status,
      mine: q.mine === "true",
      search: q.q,
      page: q.page,
      pageSize: q.pageSize,
    });
    return c.json(list);
  })
  .post("/posts", requirePermission("post:create"), zValidator("json", CreatePostInputSchema), async (c) => {
    const post = await c.var.repos.studio.createPost(c.var.claims!, c.req.valid("json"));
    return c.json({ post }, 201);
  })
  // The story editor's data in one request (post, comments, history, taxonomy, link check).
  .get("/posts/:id/editor", requirePermission("post:edit_own"), zValidator("param", Id), async (c) => {
    const bundle = await c.var.repos.studio.editorBundle(c.var.claims!, c.req.valid("param").id);
    return bundle ? c.json(bundle) : c.json(NOT_FOUND, 404);
  })
  .get("/posts/:id", requirePermission("post:create"), zValidator("param", Id), async (c) => {
    const post = await c.var.repos.studio.getPost(c.var.claims!, c.req.valid("param").id);
    return post ? c.json({ post }) : c.json(NOT_FOUND, 404);
  })
  .patch(
    "/posts/:id",
    requirePermission("post:edit_own"),
    zValidator("param", Id),
    zValidator("json", UpdatePostInputSchema),
    async (c) => {
      const post = await c.var.repos.studio.updatePost(
        c.var.claims!,
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      return c.json({ post });
    },
  )
  .delete("/posts/:id", requirePermission("post:edit_own"), zValidator("param", Id), async (c) => {
    await c.var.repos.studio.deletePost(c.var.claims!, c.req.valid("param").id);
    return c.body(null, 204);
  })
  .post(
    "/posts/:id/transition",
    requirePermission("post:submit"),
    zValidator("param", Id),
    zValidator("json", TransitionInputSchema),
    async (c) => {
      const post = await c.var.repos.studio.transition(
        c.var.claims!,
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      return c.json({ post });
    },
  )
  .get("/posts/:id/comments", requirePermission("comment:editorial"), zValidator("param", Id), async (c) =>
    c.json({ comments: await c.var.repos.studio.listComments(c.var.claims!, c.req.valid("param").id) }),
  )
  .post(
    "/posts/:id/comments",
    requirePermission("comment:editorial"),
    zValidator("param", Id),
    zValidator("json", CommentInputSchema),
    async (c) => {
      const comment = await c.var.repos.studio.addComment(
        c.var.claims!,
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      return c.json({ comment }, 201);
    },
  )
  .patch(
    "/comments/:id",
    requirePermission("comment:editorial"),
    zValidator("param", Id),
    zValidator("json", z.object({ resolved: z.boolean() }).strict()),
    async (c) => {
      const comment = await c.var.repos.studio.setCommentResolved(
        c.var.claims!,
        c.req.valid("param").id,
        c.req.valid("json").resolved,
      );
      return c.json({ comment });
    },
  )
  .get("/posts/:id/revisions", requirePermission("post:edit_own"), zValidator("param", Id), async (c) =>
    c.json({ revisions: await c.var.repos.studio.listRevisions(c.var.claims!, c.req.valid("param").id) }),
  )
  .get("/revisions/:id", requirePermission("post:edit_own"), zValidator("param", Id), async (c) => {
    const revision = await c.var.repos.studio.getRevision(c.var.claims!, c.req.valid("param").id);
    return revision ? c.json({ revision }) : c.json(NOT_FOUND, 404);
  })
  .get("/review-queue", requirePermission("post:review"), async (c) =>
    c.json({ posts: await c.var.repos.studio.reviewQueue(c.var.claims!) }),
  )
  .get("/taxonomy", requirePermission("post:create"), async (c) => {
    const [categories, tags] = await Promise.all([
      c.var.repos.studio.listCategories(c.var.claims!),
      c.var.repos.studio.listTags(c.var.claims!),
    ]);
    return c.json({ categories, tags });
  });
