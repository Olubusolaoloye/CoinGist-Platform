import type { PostStatus } from "@coingist/types";
import { STATUS_LABEL } from "~/lib/workflow";

const STYLE: Record<PostStatus, string> = {
  draft: "border-line text-muted",
  in_review: "border-link text-link",
  changes_requested: "border-warn text-warn",
  approved: "border-ok text-ok",
  scheduled: "border-ok text-ok",
  published: "border-gist bg-gist text-gist-ink",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
