import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { RoleSchema, UserStatusSchema } from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requirePermission } from "../middleware.js";

const IdParam = z.object({ id: z.string().uuid() });
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
