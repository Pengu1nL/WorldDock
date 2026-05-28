import { Body, Controller, Post } from "@nestjs/common";
import { AnalyticsService, productEventSchema } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post("events")
  record(@Body() body: unknown) {
    return { event: this.analytics.record(productEventSchema.parse(body)) };
  }
}
