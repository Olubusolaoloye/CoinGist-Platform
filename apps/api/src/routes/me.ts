import { Hono } from "hono";
import { isStaff, ROLE_PERMISSIONS } from "@coingist/types";
import type { AppEnv } from "../context.js";
import { requireUser } from "../middleware.js";

export const meRoutes = new Hono<AppEnv>().get("/", requireUser, (c) => {
  const user = c.var.user!;
  const mfaVerified = c.var.claims?.aal === "aal2";
  return c.json({
    user,
    permissions: [...ROLE_PERMISSIONS[user.role]],
    mfaVerified,
    // Studio sends staff to TOTP enrolment/challenge when this is true.
    mfaRequired: isStaff(user.role) && !mfaVerified,
  });
});
