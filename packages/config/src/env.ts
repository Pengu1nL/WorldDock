import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
]);

export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);

const optionalNonEmptyString = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const optionalUrlString = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());

export const worldDockEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema.default("development"),
  APP_ENV: runtimeEnvironmentSchema.default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1048576),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  TRUSTED_ORIGINS: z.string().optional(),
  WEB_APP_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MEILISEARCH_HOST: z.string().url(),
  MEILISEARCH_API_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(16),
  SENTRY_DSN: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  AI_PROVIDER: z.enum(["openai"]).default("openai"),
  AI_MODEL: optionalNonEmptyString,
  OPENAI_BASE_URL: optionalUrlString,
  OPENAI_API_KEY: optionalNonEmptyString,
});

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorldDockEnv = z.infer<typeof worldDockEnvSchema>;

export function parseWorldDockEnv(env: Record<string, string | undefined>): WorldDockEnv {
  return worldDockEnvSchema.parse(env);
}
