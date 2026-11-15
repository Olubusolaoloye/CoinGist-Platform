import type { Env } from "../env.js";
import { createBeehiivProvider } from "./beehiiv.js";
import { createDevNewsletterProvider } from "./dev-provider.js";
import type { NewsletterProvider } from "./provider.js";

export function newsletterProviderFromEnv(env: Env): NewsletterProvider {
  if (env.NEWSLETTER_PROVIDER === "dev") {
    if (process.env["NODE_ENV"] === "production") throw new Error("NEWSLETTER_PROVIDER=dev is not allowed in production");
    return createDevNewsletterProvider();
  }
  return createBeehiivProvider({
    apiKey: env.BEEHIIV_API_KEY!,
    publicationId: env.BEEHIIV_PUBLICATION_ID!,
    siteUrl: env.SITE_URL,
  });
}
