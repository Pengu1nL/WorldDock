import pino, { type Logger, type LoggerOptions } from "pino";

export const REDACTED_LOG_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "authorization",
  "accessToken",
  "refreshToken",
  "apiKey",
  "password",
  "*.authorization",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.password",
] as const;

export type CreateLoggerOptions = {
  service: string;
  level?: LoggerOptions["level"];
  environment?: string;
};

export function createLogger(options: CreateLoggerOptions): Logger {
  return pino({
    name: options.service,
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    base: {
      service: options.service,
      environment: options.environment ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    },
    redact: {
      paths: [...REDACTED_LOG_PATHS],
      censor: "[REDACTED]",
    },
  });
}
