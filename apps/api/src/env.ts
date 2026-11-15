import { z } from "zod";

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8787),
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    /** Legacy HS256 secret. If unset, tokens are verified against the project's JWKS. */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
