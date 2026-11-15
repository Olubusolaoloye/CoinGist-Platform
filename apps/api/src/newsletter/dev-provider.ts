import { createHash } from "node:crypto";
import { ProviderError, type NewsletterProvider } from "./provider.js";

/**
 * Local stand-in for the newsletter tool. Logs instead of emailing and confirms immediately.
 * An address containing "+fail" simulates an outage so the retry path can be tried locally.
 */
export function createDevNewsletterProvider(log: (msg: string) => void = console.log): NewsletterProvider {
  return {
    name: "dev",
    async subscribe({ email, lists, source }) {
      if (email.includes("+fail")) throw new ProviderError("Simulated newsletter outage (+fail address)", true);
      const externalId = `dev_${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;
      log(`newsletter(dev): subscribed ${email} to ${lists.join(", ")} from ${source}`);
      return { externalId, status: "active" };
    },
  };
}
