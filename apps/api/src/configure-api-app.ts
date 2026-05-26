import type { INestApplication } from "@nestjs/common";
import { ApiErrorFilter } from "./common/api-error.filter";
import { configureSecurity } from "./common/security";
import { ZodValidationPipe } from "./common/zod-validation.pipe";

export function configureApiApp(app: INestApplication) {
  app.setGlobalPrefix("v1");
  configureSecurity(app);
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();
}
