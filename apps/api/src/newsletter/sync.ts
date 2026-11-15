import type { NewsletterRepository } from "@coingist/db";
import type { Subscriber } from "@coingist/types";
import { ProviderError, type NewsletterProvider } from "./provider.js";

export const MAX_SYNC_ATTEMPTS = 5;

/** Send one subscriber to the newsletter tool and record the outcome. Never throws. */
export async function syncSubscriber(
  repo: NewsletterRepository,
  provider: NewsletterProvider,
  sub: Pick<Subscriber, "id" | "email" | "lists" | "source">,
): Promise<"synced" | "failed"> {
  try {
    const result = await provider.subscribe({
      email: sub.email,
      lists: sub.lists,
      source: sub.source ?? "other",
      // Every sync comes from someone submitting the signup form (consent recorded in
      // consented_at), so reactivating a previously unsubscribed address is what they asked for.
      reactivate: true,
    });
    await repo.markSynced(sub.id, result.externalId, result.status);
    return "synced";
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : `Unexpected: ${(err as Error).message}`;
    await repo.markSyncFailed(sub.id, message).catch(() => {});
    if (!(err instanceof ProviderError)) console.error("newsletter sync failed", err);
    return "failed";
  }
}

/** Retry job: push every pending or failed subscriber (up to the attempt limit). */
export async function syncPending(repo: NewsletterRepository, provider: NewsletterProvider, limit = 100) {
  const todo = await repo.pendingSync(limit, MAX_SYNC_ATTEMPTS);
  let synced = 0;
  for (const sub of todo) {
    if ((await syncSubscriber(repo, provider, sub)) === "synced") synced += 1;
  }
  return { attempted: todo.length, synced };
}
