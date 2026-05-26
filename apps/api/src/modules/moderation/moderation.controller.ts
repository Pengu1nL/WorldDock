import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createReportSchema, moderateReportSchema, reportStatusSchema } from "@worlddock/domain";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { ModerationService } from "./moderation.service";

@Controller()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("repositories/:repositoryId/reports")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async report(
    @CurrentSubject() subject: AuthSubject,
    @Param("repositoryId") repositoryId: string,
    @Body() body: unknown,
  ) {
    return { report: await this.moderationService.reportRepository(subject, repositoryId, createReportSchema.parse(body)) };
  }

  @Get("admin/reports")
  @UseGuards(WorldDockAuthGuard)
  async listReports(@CurrentSubject() subject: AuthSubject, @Query("status") status?: string) {
    return {
      reports: await this.moderationService.listReports(
        subject,
        status ? reportStatusSchema.parse(status) : undefined,
      ),
    };
  }

  @Post("admin/reports/:reportId/actions")
  @UseGuards(WorldDockAuthGuard)
  async moderate(
    @CurrentSubject() subject: AuthSubject,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
  ) {
    return this.moderationService.moderateReport(subject, reportId, moderateReportSchema.parse(body));
  }
}
