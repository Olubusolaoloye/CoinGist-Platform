import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  AdBookingInputSchema,
  BlockedDomainInputSchema,
  OrderCreateSchema,
  OrderUpdateSchema,
  SPONSORED_ORDER_STATUSES,
  SponsorInputSchema,
} from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requirePermission } from "../middleware.js";

const Id = z.object({ id: z.string().uuid() });
const noStore = async (c: { header: (k: string, v: string) => void }, next: () => Promise<void>) => {
  await next();
  c.header("Cache-Control", "no-store");
};

/** Studio: sponsors, orders, link safety and ads. */
export const commerceRoutes = new Hono<AppEnv>()
  .use("*", noStore)
  // Sponsors
  .get("/sponsors", requirePermission("sponsored:manage"), async (c) =>
    c.json({ sponsors: await c.var.repos.commerce.listSponsors(c.var.claims!) }),
  )
  .post("/sponsors", requirePermission("sponsored:manage"), zValidator("json", SponsorInputSchema), async (c) =>
    c.json({ sponsor: await c.var.repos.commerce.createSponsor(c.var.claims!, c.req.valid("json")) }, 201),
  )
  .patch(
    "/sponsors/:id",
    requirePermission("sponsored:manage"),
    zValidator("param", Id),
    zValidator("json", SponsorInputSchema.partial()),
    async (c) => c.json({ sponsor: await c.var.repos.commerce.updateSponsor(c.var.claims!, c.req.valid("param").id, c.req.valid("json")) }),
  )
  // Orders
  .get(
    "/orders",
    requirePermission("sponsored:manage"),
    zValidator("query", z.object({ status: z.enum(SPONSORED_ORDER_STATUSES).optional() })),
    async (c) => c.json({ orders: await c.var.repos.commerce.listOrders(c.var.claims!, c.req.valid("query")) }),
  )
  .post("/orders", requirePermission("sponsored:manage"), zValidator("json", OrderCreateSchema), async (c) =>
    c.json({ order: await c.var.repos.commerce.createOrder(c.var.claims!, c.req.valid("json")) }, 201),
  )
  .get("/orders/:id", requirePermission("sponsored:manage"), zValidator("param", Id), async (c) => {
    const order = await c.var.repos.commerce.getOrder(c.var.claims!, c.req.valid("param").id);
    return order ? c.json({ order }) : c.json({ error: { code: "not_found", message: "Not found" } }, 404);
  })
  .patch("/orders/:id", requirePermission("sponsored:manage"), zValidator("param", Id), zValidator("json", OrderUpdateSchema), async (c) =>
    c.json({ order: await c.var.repos.commerce.updateOrder(c.var.claims!, c.req.valid("param").id, c.req.valid("json")) }),
  )
  // Link safety: everyone on staff can see the list and check a post; editors manage it.
  .get("/blocked-domains", requirePermission("post:create"), async (c) =>
    c.json({ domains: await c.var.repos.commerce.listBlockedDomains(c.var.claims!) }),
  )
  .post("/blocked-domains", requirePermission("post:review"), zValidator("json", BlockedDomainInputSchema), async (c) =>
    c.json({ domain: await c.var.repos.commerce.blockDomain(c.var.claims!, c.req.valid("json")) }, 201),
  )
  .delete(
    "/blocked-domains/:domain",
    requirePermission("post:review"),
    zValidator("param", z.object({ domain: z.string().max(253) })),
    async (c) => {
      await c.var.repos.commerce.unblockDomain(c.var.claims!, c.req.valid("param").domain);
      return c.body(null, 204);
    },
  )
  .get("/posts/:id/link-check", requirePermission("post:create"), zValidator("param", Id), async (c) =>
    c.json({ blocked: await c.var.repos.commerce.checkPostLinks(c.var.claims!, c.req.valid("param").id) }),
  )
  // Ads
  .get("/ads/slots", requirePermission("ads:manage"), async (c) => c.json({ slots: await c.var.repos.commerce.listSlots(c.var.claims!) }))
  .get("/ads/bookings", requirePermission("ads:manage"), async (c) =>
    c.json({ bookings: await c.var.repos.commerce.listBookings(c.var.claims!) }),
  )
  .post("/ads/bookings", requirePermission("ads:manage"), zValidator("json", AdBookingInputSchema), async (c) =>
    c.json({ booking: await c.var.repos.commerce.createBooking(c.var.claims!, c.req.valid("json")) }, 201),
  )
  .patch(
    "/ads/bookings/:id",
    requirePermission("ads:manage"),
    zValidator("param", Id),
    zValidator("json", z.object({ approved: z.boolean() }).strict()),
    async (c) =>
      c.json({ booking: await c.var.repos.commerce.setBookingApproved(c.var.claims!, c.req.valid("param").id, c.req.valid("json").approved) }),
  )
  .delete("/ads/bookings/:id", requirePermission("ads:manage"), zValidator("param", Id), async (c) => {
    await c.var.repos.commerce.deleteBooking(c.var.claims!, c.req.valid("param").id);
    return c.body(null, 204);
  });

/** Public: live ads for a placement, and click counting. */
export const publicAdRoutes = new Hono<AppEnv>()
  .get("/", zValidator("query", z.object({ placement: z.enum(["home", "article", "newsletter"]) })), async (c) => {
    c.header("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return c.json({ slots: await c.var.repos.commerce.liveAds(c.req.valid("query").placement) });
  })
  .post("/:id/click", zValidator("param", Id), async (c) => {
    c.header("Cache-Control", "no-store");
    const url = await c.var.repos.commerce.recordClick(c.req.valid("param").id);
    return url ? c.json({ url }) : c.json({ error: { code: "not_found", message: "This ad isn't running" } }, 404);
  });
