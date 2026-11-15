import { z } from "zod";

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8787),
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    /** Legacy HS256 secret. If unset, tokens are verified against the project's JWKS. */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    SITE_URL: z.string().url().default("http://localhost:5173"),
    NEWSLETTER_PROVIDER: z.enum(["beehiiv", "dev"]).default("beehiiv"),
    BEEHIIV_API_KEY: z.string().min(1).optional(),
    BEEHIIV_PUBLICATION_ID: z.string().min(1).optional(),
    /** Svix signing secret from Beehiiv's webhook settings (whsec_...). */
    BEEHIIV_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  })
  .refine(
    (e) => e.NEWSLETTER_PROVIDER !== "beehiiv" || (e.BEEHIIV_API_KEY && e.BEEHIIV_PUBLICATION_ID),
    { message: "BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID are required when NEWSLETTER_PROVIDER=beehiiv" },
  );

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
