import { BadRequestException, Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createReportSchema, type CreateReportInput } from "@worlddock/domain";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { ModerationService } from "./moderation.service";

@Controller()
export class ModerationController {
  constructor(@Inject(ModerationService) private readonly moderationService: ModerationService) {}

  @Post("repositories/:repositoryId/reports")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async report(
    @CurrentSubject() subject: AuthSubject,
    @Param("repositoryId") repositoryId: string,
    @Body() body: unknown,
  ) {
    return { report: await this.moderationService.reportRepository(subject, repositoryId, parseCreateReport(body)) };
  }

  @Post("community/creators/:handle/reports")
  @UseGuards(WorldDockAuthGuard)
  @RequireScopes("world:write")
  async reportCreator(
    @CurrentSubject() subject: AuthSubject,
    @Param("handle") handle: string,
    @Body() body: unknown,
  ) {
    return { report: await this.moderationService.reportCreator(subject, handle, parseCreateReport(body)) };
  }
}

function parseCreateReport(body: unknown): CreateReportInput {
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "BAD_REQUEST",
      message: "Report detail is too short.",
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}
