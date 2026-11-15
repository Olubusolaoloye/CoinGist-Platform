import type { NewsletterList, SubscriberStatus } from "@coingist/types";

export interface ProviderSubscribeInput {
  email: string;
  lists: NewsletterList[];
  source: string;
  /** The person previously unsubscribed and has now knowingly signed up again. */
  reactivate: boolean;
}

export interface ProviderSubscribeResult {
  externalId: string;
  status: SubscriberStatus;
}

/** The external newsletter tool (Beehiiv today; Resend could implement the same interface). */
export interface NewsletterProvider {
  readonly name: string;
  subscribe(input: ProviderSubscribeInput): Promise<ProviderSubscribeResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** Worth retrying later (timeouts, 429, 5xx). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
