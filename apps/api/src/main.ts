import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { parseWorldDockEnv } from "@worlddock/config";
import { AppModule } from "./app.module";
import { createFastifyLoggerOptions, parseBodyLimit } from "./common/logging";
import { initObservability } from "./common/observability";
import { configureApiApp } from "./configure-api-app";

async function bootstrap() {
  const env = parseWorldDockEnv(process.env);
  initObservability("worlddock-api");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: parseBodyLimit(),
      logger: createFastifyLoggerOptions(),
    }),
  );
  configureApiApp(app);

  const port = env.API_PORT;
  const host = env.API_HOST;
  await app.listen({ port, host });
}

void bootstrap();
