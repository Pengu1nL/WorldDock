import "reflect-metadata";
import { loadWorkspaceEnv } from "@worlddock/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { createFastifyLoggerOptions, parseBodyLimit } from "./common/logging";
import { initObservability } from "./common/observability";
import { configureApiApp } from "./configure-api-app";

loadWorkspaceEnv(import.meta.url);

async function bootstrap() {
  initObservability("worlddock-api");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: parseBodyLimit(),
      logger: createFastifyLoggerOptions(),
    }),
  );
  configureApiApp(app);

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

void bootstrap();
