import type { INestApplication } from "@nestjs/common";
import { ApiErrorFilter } from "./common/api-error.filter";
import { ZodValidationPipe } from "./common/zod-validation.pipe";

export function configureApiApp(app: INestApplication) {
  app.setGlobalPrefix("v1");
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();
}
