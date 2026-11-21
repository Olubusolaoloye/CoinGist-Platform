import type { Env } from "../env.js";
import { createBeehiivProvider } from "./beehiiv.js";
import { createDevNewsletterProvider } from "./dev-provider.js";
import { ProviderError, type NewsletterProvider } from "./provider.js";

export function newsletterProviderFromEnv(env: Env): NewsletterProvider {
  if (env.NEWSLETTER_PROVIDER === "dev") {
    if (process.env["NODE_ENV"] === "production") throw new Error("NEWSLETTER_PROVIDER=dev is not allowed in production");
    return createDevNewsletterProvider();
  }
  if (env.NEWSLETTER_PROVIDER === "off") {
    return {
      name: "off",
      subscribe: async () => {
        throw new ProviderError("Newsletter provider not configured", true);
      },
    };
  }
  return createBeehiivProvider({
    apiKey: env.BEEHIIV_API_KEY!,
    publicationId: env.BEEHIIV_PUBLICATION_ID!,
    siteUrl: env.SITE_URL,
  });
}
