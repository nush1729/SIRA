import { z } from "zod";

// Fail fast and loud if required config is missing — never silently fall back to an
// undefined secret. See architecture doc Section 11 (Security): "secrets only via env vars."
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_BASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),

  PROVIDER_MODE: z.enum(["sandbox", "live"]).default("sandbox"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_EXPLAIN_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const env = parsed.data;

  if (env.PROVIDER_MODE === "live") {
    const requiredForLive: (keyof Env)[] = [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "SENDGRID_API_KEY",
      "EMAIL_FROM_ADDRESS",
    ];
    const missing = requiredForLive.filter((key) => !env[key]);
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`PROVIDER_MODE=live requires these env vars: ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  return env;
}

export const env = loadEnv();
