import { canTransition, hasAtLeast, type PostStatus, type Role, type StudioPost } from "@coingist/types";

export interface WorkflowAction {
  to: PostStatus;
  label: string;
  style: "primary" | "gist" | "default" | "danger";
  /** Needs a note for the writer (request changes). */
  note?: "required" | "optional";
  /** Needs a publish time. */
  schedule?: boolean;
  confirm?: string;
}

const ACTIONS: Array<{ from: PostStatus } & WorkflowAction> = [
  { from: "draft", to: "in_review", label: "Submit for review", style: "primary" },
  { from: "changes_requested", to: "in_review", label: "Resubmit for review", style: "primary" },
  { from: "in_review", to: "approved", label: "Approve", style: "primary", note: "optional" },
  { from: "in_review", to: "changes_requested", label: "Request changes", style: "default", note: "required" },
  { from: "approved", to: "published", label: "Publish now", style: "gist", confirm: "Publish this story now? It will be live on the site immediately." },
  { from: "approved", to: "scheduled", label: "Schedule", style: "default", schedule: true },
  { from: "scheduled", to: "published", label: "Publish now", style: "gist", confirm: "Publish this story now instead of at the scheduled time?" },
  { from: "scheduled", to: "approved", label: "Unschedule", style: "default" },
  { from: "published", to: "draft", label: "Unpublish", style: "danger", confirm: "Unpublish this story? It will disappear from the site and need review again before it can return." },
];

/**
 * UI mirror of the database's workflow rules, so people only see buttons that will work.
 * The database (transition_post) remains the authority.
 */
export function workflowActions(role: Role, userId: string, post: Pick<StudioPost, "status" | "author">): WorkflowAction[] {
  return ACTIONS.filter((a) => {
    if (a.from !== post.status || !canTransition(role, a.from, a.to)) return false;
    if (a.to === "in_review" && role === "writer" && post.author.id !== userId) return false;
    if (a.to === "approved" && a.from === "in_review" && post.author.id === userId && role !== "admin") return false;
    return true;
  });
}

export function canEditContent(role: Role, userId: string, post: Pick<StudioPost, "status" | "author">): boolean {
  if (hasAtLeast(role, "editor")) return true;
  return role === "writer" && post.author.id === userId && ["draft", "changes_requested"].includes(post.status);
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

/** Why the editor is read-only, in the writer's terms. */
export function lockedReason(status: PostStatus): string {
  switch (status) {
    case "in_review":
      return "This story is with an editor. You can edit it again if they request changes.";
    case "approved":
    case "scheduled":
      return "This story is approved. Only editors can change it now.";
    case "published":
      return "This story is live. Only editors can change it now.";
    default:
      return "You can't edit this story.";
  }
}
