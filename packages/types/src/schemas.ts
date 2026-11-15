import { z } from "zod";
import { POST_STATUSES, POST_TYPES, ROLES, USER_STATUSES } from "./enums.js";

export const RoleSchema = z.enum(ROLES);
export const UserStatusSchema = z.enum(USER_STATUSES);
export const PostTypeSchema = z.enum(POST_TYPES);
export const PostStatusSchema = z.enum(POST_STATUSES);

export const SlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, numbers and single hyphens only");

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
  twoFactorEnabled: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UpdateRoleInputSchema = z.object({ role: RoleSchema });
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
