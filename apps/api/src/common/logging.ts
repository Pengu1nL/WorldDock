export function createFastifyLoggerOptions() {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.token",
        "req.body.accessToken",
        "req.body.apiKey",
        "req.body.password",
        "OPENAI_API_KEY",
      ],
      censor: "[REDACTED]",
    },
  };
}

export function parseBodyLimit() {
  return Number(process.env.API_BODY_LIMIT_BYTES ?? 1_048_576);
}
