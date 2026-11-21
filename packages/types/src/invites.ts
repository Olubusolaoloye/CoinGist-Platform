import { z } from "zod";
import { STAFF_ROLES } from "./roles.js";

/** An open invitation for an email address to join Studio with a role. */
export interface StaffInvite {
  id: string;
  email: string;
  role: (typeof STAFF_ROLES)[number];
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
}

export const StaffInviteInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
    role: z.enum(STAFF_ROLES).default("writer"),
  })
  .strict();
export type StaffInviteInput = z.infer<typeof StaffInviteInputSchema>;

/** "invited": we'll email them; "existing": they already had an account and now have the role. */
export type StaffInviteOutcome = "invited" | "existing";
