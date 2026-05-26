import { Controller, Get, Req, ServiceUnavailableException } from "@nestjs/common";
import { getRequestId, type RequestWithRequestId } from "../../common/request-id";
import { ReadinessService } from "./readiness.service";

@Controller("system")
export class SystemController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get("health")
  health(@Req() request: RequestWithRequestId) {
    return {
      status: "ok",
      service: "worlddock-api",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      requestId: getRequestId(request),
    };
  }

  @Get("readiness")
  async readiness(@Req() request: RequestWithRequestId) {
    const result = await this.readinessService.check();

    if (!result.ready) {
      throw new ServiceUnavailableException({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Service dependencies are not ready.",
        details: {
          dependencies: result.dependencies,
        },
      });
    }

    return {
      status: "ready",
      dependencies: result.dependencies,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(request),
    };
  }
}
