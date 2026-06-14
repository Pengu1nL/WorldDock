import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
]);

export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);

export const agentProviderSchema = z.literal("pi").default("pi");

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().min(1).optional(),
);

const optionalUrlString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().url().optional(),
);

export const worldDockEnvSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema.default("development"),
  APP_ENV: runtimeEnvironmentSchema.default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1048576),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  TRUSTED_ORIGINS: z.string().optional(),
  WORLD_DOCK_DATA_DIR: z.string().min(1).default(".worlddock/data"),
  WEB_APP_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  SENTRY_DSN: optionalUrlString,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrlString,
  OTEL_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  AI_PROVIDER: agentProviderSchema,
  AI_MODEL: optionalNonEmptyString,
  PI_AGENT_CORE_VERSION: optionalNonEmptyString,
  PI_AI_VERSION: optionalNonEmptyString,
  PI_MODEL_PROVIDER: optionalNonEmptyString,
  PI_MODEL_ID: optionalNonEmptyString,
  PI_PROVIDER_API_KEY: optionalNonEmptyString,
  PI_SKILLS_DIR: optionalNonEmptyString,
});

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WorldDockEnv = z.infer<typeof worldDockEnvSchema>;

export function parseWorldDockEnv(env: Record<string, string | undefined>): WorldDockEnv {
  const parsed = worldDockEnvSchema.parse(env);
  const hasExplicitAppEnv = typeof env.APP_ENV === "string" && env.APP_ENV.trim() !== "";
  const isProduction = hasExplicitAppEnv
    ? parsed.APP_ENV === "production"
    : parsed.NODE_ENV === "production";

  if (!isProduction) {
    return parsed;
  }

  if (!parsed.SENTRY_DSN) {
    throw new Error("SENTRY_DSN is required in production.");
  }

  if (!parsed.PI_MODEL_PROVIDER || !parsed.PI_MODEL_ID || !parsed.PI_PROVIDER_API_KEY) {
    throw new Error(
      "PI_MODEL_PROVIDER, PI_MODEL_ID, and PI_PROVIDER_API_KEY are required when AI_PROVIDER=pi in production.",
    );
  }

  return parsed;
}
