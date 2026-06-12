import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { ExportsService } from "./exports.service";

const importWorldSchema = z.object({
  package: z.unknown(),
});

@Controller()
export class ExportsController {
  constructor(@Inject(ExportsService) private readonly exportsService: ExportsService) {}

  @Post("worlds/:worldId/export")
  exportWorld(@Param("worldId") worldId: string) {
    return this.exportsService.exportWorld(worldId);
  }

  @Get("exports/:exportId")
  getExport(@Param("exportId") exportId: string) {
    return this.exportsService.getExport(exportId);
  }

  @Post("worlds/import")
  importWorld(@Body() body: unknown) {
    return this.exportsService.importWorld(importWorldSchema.parse(body));
  }
}
