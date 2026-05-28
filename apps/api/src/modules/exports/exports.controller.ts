import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { ExportsService } from "./exports.service";

const importWorldSchema = z.object({
  package: z.unknown(),
});

@Controller()
@UseGuards(WorldDockAuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post("worlds/:worldId/export")
  @RequireScopes("world:read")
  exportWorld(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string) {
    return this.exportsService.exportWorld(subject, worldId);
  }

  @Get("exports/:exportId")
  @RequireScopes("world:read")
  getExport(@CurrentSubject() subject: AuthSubject, @Param("exportId") exportId: string) {
    return this.exportsService.getExport(subject, exportId);
  }

  @Post("worlds/import")
  @RequireScopes("world:write")
  importWorld(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.exportsService.importWorld(subject, importWorldSchema.parse(body));
  }

  @Post("account/data-export")
  @RequireScopes("world:read")
  requestAccountExport(@CurrentSubject() subject: AuthSubject) {
    return this.exportsService.requestAccountDataExport(subject);
  }

  @Get("account/data-export/:exportId")
  @RequireScopes("world:read")
  getAccountExport(@CurrentSubject() subject: AuthSubject, @Param("exportId") exportId: string) {
    return this.exportsService.getAccountDataExport(subject, exportId);
  }
}
