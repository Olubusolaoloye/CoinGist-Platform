import { describe, expect, it } from "vitest";
import { canEditContent, workflowActions } from "./workflow";

const author = { id: "writer-1", name: "W" };
const labels = (role: Parameters<typeof workflowActions>[0], userId: string, status: Parameters<typeof workflowActions>[2]["status"]) =>
  workflowActions(role, userId, { status, author }).map((a) => a.label);

describe("workflowActions", () => {
  it("offers writers only submit on their own drafts", () => {
    expect(labels("writer", "writer-1", "draft")).toEqual(["Submit for review"]);
    expect(labels("writer", "someone-else", "draft")).toEqual([]);
    expect(labels("writer", "writer-1", "in_review")).toEqual([]);
  });

  it("offers editors review and publishing actions", () => {
    expect(labels("editor", "editor-1", "in_review")).toEqual(["Approve", "Request changes"]);
    expect(labels("editor", "editor-1", "approved")).toEqual(["Publish now", "Schedule"]);
    expect(labels("editor", "editor-1", "published")).toEqual(["Unpublish"]);
  });

  it("hides Approve on an editor's own post but not an admin's", () => {
    expect(labels("editor", "writer-1", "in_review")).toEqual(["Request changes"]);
    expect(labels("admin", "writer-1", "in_review")).toEqual(["Approve", "Request changes"]);
  });

  it("gives readers nothing", () => {
    expect(labels("reader", "writer-1", "draft")).toEqual([]);
  });
});

describe("canEditContent", () => {
  it("matches the database's edit rules", () => {
    expect(canEditContent("writer", "writer-1", { status: "draft", author })).toBe(true);
    expect(canEditContent("writer", "writer-1", { status: "changes_requested", author })).toBe(true);
    expect(canEditContent("writer", "writer-1", { status: "in_review", author })).toBe(false);
    expect(canEditContent("writer", "x", { status: "draft", author })).toBe(false);
    expect(canEditContent("editor", "x", { status: "published", author })).toBe(true);
  });
});
