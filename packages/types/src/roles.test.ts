import { describe, expect, it } from "vitest";
import { ROLES } from "./enums.js";
import { can, canTransition, hasAtLeast, isStaff } from "./roles.js";

describe("roles", () => {
  it("treats writer, editor and admin as staff, not reader", () => {
    expect(ROLES.filter(isStaff)).toEqual(["writer", "editor", "admin"]);
  });

  it("orders roles by privilege", () => {
    expect(hasAtLeast("admin", "editor")).toBe(true);
    expect(hasAtLeast("writer", "editor")).toBe(false);
    expect(hasAtLeast("reader", "reader")).toBe(true);
  });

  it("gives readers no permissions", () => {
    expect(can("reader", "post:create")).toBe(false);
    expect(can("reader", "ai:use")).toBe(false);
  });

  it("only lets admins manage roles and payouts", () => {
    expect(can("admin", "user:manage_roles")).toBe(true);
    expect(can("editor", "user:manage_roles")).toBe(false);
    expect(can("editor", "payments:manage")).toBe(false);
  });
});

describe("post workflow", () => {
  it("lets writers submit but not approve or publish", () => {
    expect(canTransition("writer", "draft", "in_review")).toBe(true);
    expect(canTransition("writer", "in_review", "approved")).toBe(false);
    expect(canTransition("writer", "approved", "published")).toBe(false);
  });

  it("lets editors review and publish", () => {
    expect(canTransition("editor", "in_review", "approved")).toBe(true);
    expect(canTransition("editor", "in_review", "changes_requested")).toBe(true);
    expect(canTransition("editor", "approved", "scheduled")).toBe(true);
  });

  it("rejects transitions that skip review", () => {
    expect(canTransition("admin", "draft", "published")).toBe(false);
    expect(canTransition("admin", "draft", "approved")).toBe(false);
  });
});
