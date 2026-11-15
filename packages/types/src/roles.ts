import type { PostStatus, Role } from "./enums.js";

/** Roles that can sign in to Studio. All of them must have TOTP 2FA. */
export const STAFF_ROLES = ["writer", "editor", "admin"] as const satisfies readonly Role[];
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaff(role: Role): role is StaffRole {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}

const RANK: Record<Role, number> = { reader: 0, writer: 1, editor: 2, admin: 3 };

/** True if `role` is at least as privileged as `min`. */
export function hasAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export const PERMISSIONS = [
  "post:create",
  "post:edit_own",
  "post:edit_any",
  "post:submit",
  "post:review", // approve / request changes
  "post:publish", // schedule / publish
  "post:delete",
  "comment:editorial",
  "user:manage_roles",
  "payments:view_own",
  "payments:manage",
  "sponsored:manage",
  "ads:manage",
  "audit:view",
  "ai:use",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const WRITER: Permission[] = [
  "post:create",
  "post:edit_own",
  "post:submit",
  "comment:editorial",
  "payments:view_own",
  "ai:use",
];
const EDITOR: Permission[] = [
  ...WRITER,
  "post:edit_any",
  "post:review",
  "post:publish",
  "sponsored:manage",
  "ads:manage",
];
const ADMIN: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  reader: new Set(),
  writer: new Set(WRITER),
  editor: new Set(EDITOR),
  admin: new Set(ADMIN),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Editorial workflow: which status transitions are allowed, and the permission each needs.
 * draft -> in_review -> changes_requested | approved -> scheduled -> published
 */
export const POST_TRANSITIONS: ReadonlyArray<{
  from: PostStatus;
  to: PostStatus;
  permission: Permission;
}> = [
  { from: "draft", to: "in_review", permission: "post:submit" },
  { from: "changes_requested", to: "in_review", permission: "post:submit" },
  { from: "in_review", to: "changes_requested", permission: "post:review" },
  { from: "in_review", to: "approved", permission: "post:review" },
  { from: "approved", to: "scheduled", permission: "post:publish" },
  { from: "approved", to: "published", permission: "post:publish" },
  { from: "scheduled", to: "published", permission: "post:publish" },
  { from: "scheduled", to: "approved", permission: "post:publish" }, // unschedule
  { from: "published", to: "draft", permission: "post:publish" }, // unpublish
];

export function canTransition(role: Role, from: PostStatus, to: PostStatus): boolean {
  const rule = POST_TRANSITIONS.find((t) => t.from === from && t.to === to);
  return rule !== undefined && can(role, rule.permission);
}
