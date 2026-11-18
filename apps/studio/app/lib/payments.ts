import type { PaymentStatus } from "@coingist/types";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending approval",
  approved: "Approved, to pay",
  paid: "Paid",
  cancelled: "Cancelled",
};
