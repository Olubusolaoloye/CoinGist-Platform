import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  PaymentCreateSchema,
  PaymentListQuerySchema,
  PaymentUpdateSchema,
  RoleSchema,
  UpdateCategoryInputSchema,
  UserStatusSchema,
} from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requirePermission } from "../middleware.js";

const IdParam = z.object({ id: z.string().uuid() });
const SlugParam = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100) });
const Paging = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  entity: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
});

export const adminRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  })
  .get("/dashboard", requirePermission("user:manage_roles"), async (c) =>
    c.json({ dashboard: await c.var.repos.insights.adminDashboard(c.var.claims!) }),
  )
  // Site images: category covers
  .get("/categories", requirePermission("site:manage"), async (c) =>
    c.json({ categories: await c.var.repos.studio.listCategoryDetails(c.var.claims!) }),
  )
  .patch(
    "/categories/:slug",
    requirePermission("site:manage"),
    zValidator("param", SlugParam),
    zValidator("json", UpdateCategoryInputSchema),
    async (c) => {
      const category = await c.var.repos.studio.updateCategory(c.var.claims!, c.req.valid("param").slug, c.req.valid("json"));
      return category ? c.json({ category }) : c.json({ error: { code: "not_found", message: "Not found" } }, 404);
    },
  )
  // Writer payouts
  .get("/payments", requirePermission("payments:manage"), zValidator("query", PaymentListQuerySchema), async (c) =>
    c.json({ payments: await c.var.repos.insights.listPayments(c.var.claims!, c.req.valid("query")) }),
  )
  .get("/payments/unpaid-stories", requirePermission("payments:manage"), async (c) =>
    c.json({ stories: await c.var.repos.insights.unpaidStories(c.var.claims!) }),
  )
  .post("/payments", requirePermission("payments:manage"), zValidator("json", PaymentCreateSchema), async (c) =>
    c.json({ payment: await c.var.repos.insights.createPayment(c.var.claims!, c.req.valid("json")) }, 201),
  )
  .patch(
    "/payments/:id",
    requirePermission("payments:manage"),
    zValidator("param", IdParam),
    zValidator("json", PaymentUpdateSchema),
    async (c) =>
      c.json({ payment: await c.var.repos.insights.updatePayment(c.var.claims!, c.req.valid("param").id, c.req.valid("json")) }),
  )
  .get("/users", requirePermission("user:manage_roles"), zValidator("query", Paging), async (c) => {
    const users = await c.var.repos.users.list(c.var.claims!, c.req.valid("query"));
    return c.json({ users });
  })
  .patch(
    "/users/:id/role",
    requirePermission("user:manage_roles"),
    zValidator("param", IdParam),
    zValidator("json", z.object({ role: RoleSchema }).strict()),
    async (c) => {
      const user = await c.var.repos.users.setRole(
        c.var.claims!,
        c.req.valid("param").id,
        c.req.valid("json").role,
      );
      return c.json({ user });
    },
  )
  .patch(
    "/users/:id/status",
    requirePermission("user:manage_roles"),
    zValidator("param", IdParam),
    zValidator("json", z.object({ status: UserStatusSchema }).strict()),
    async (c) => {
      const user = await c.var.repos.users.setStatus(
        c.var.claims!,
        c.req.valid("param").id,
        c.req.valid("json").status,
      );
      return c.json({ user });
    },
  )
  .get("/audit-logs", requirePermission("audit:view"), zValidator("query", AuditQuery), async (c) => {
    const logs = await c.var.repos.audit.list(c.var.claims!, c.req.valid("query"));
    return c.json({ logs });
  });
