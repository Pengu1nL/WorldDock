import { Body, Controller, Post, Req } from "@nestjs/common";
import { productEventInputSchema } from "@worlddock/domain";
import { AnalyticsService } from "./analytics.service";

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post("events")
  async record(@Body() body: unknown, @Req() request: RequestWithHeaders) {
    return {
      event: await this.analytics.record(
        productEventInputSchema.parse(body),
        firstHeaderValue(request.headers["user-agent"]),
      ),
    };
  }
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
