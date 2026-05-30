import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { ReleasesService } from "./releases.service";

const releasePreviewSchema = z.object({
  releaseNote: z.string().optional(),
  license: z.string().optional(),
});

@Controller()
@UseGuards(WorldDockAuthGuard)
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Post("worlds/:worldId/releases/preview")
  @RequireScopes("world:write")
  async previewWorldRelease(
    @CurrentSubject() subject: AuthSubject,
    @Param("worldId") worldId: string,
    @Body() body: unknown,
  ) {
    return { preflight: await this.releases.previewWorldRelease(subject, worldId, releasePreviewSchema.parse(body)) };
  }

  @Post("releases/:releaseId/rollback")
  @RequireScopes("world:write")
  async rollbackRelease(@CurrentSubject() subject: AuthSubject, @Param("releaseId") releaseId: string) {
    return this.releases.rollbackRelease(subject, releaseId);
  }

  @Get("forks/:forkId/upstream-diff")
  @RequireScopes("world:write")
  async forkUpstreamDiff(@CurrentSubject() subject: AuthSubject, @Param("forkId") forkId: string) {
    return { diff: await this.releases.getForkUpstreamDiff(subject, forkId) };
  }

  @Post("forks/:forkId/sync")
  @RequireScopes("world:write")
  async syncFork(@CurrentSubject() subject: AuthSubject, @Param("forkId") forkId: string) {
    return { sync: await this.releases.syncFork(subject, forkId) };
  }

  @Post("forks/:forkId/detach")
  @RequireScopes("world:write")
  async detachFork(@CurrentSubject() subject: AuthSubject, @Param("forkId") forkId: string) {
    return { fork: await this.releases.detachFork(subject, forkId) };
  }
}
