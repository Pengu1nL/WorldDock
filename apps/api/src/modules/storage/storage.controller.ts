import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { createStorageUploadSchema } from "@worlddock/domain";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { StorageService } from "./storage.service";

const attachObjectSchema = z.object({
  objectId: z.string().min(1),
});

@Controller()
@UseGuards(WorldDockAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post("storage/upload-url")
  @RequireScopes("world:write")
  async createUploadUrl(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.storageService.createUploadUrl(subject, createStorageUploadSchema.parse(body));
  }

  @Get("storage/objects/:objectId/download-url")
  @RequireScopes("world:read")
  async createDownloadUrl(@CurrentSubject() subject: AuthSubject, @Param("objectId") objectId: string) {
    return this.storageService.createDownloadUrl(subject, objectId);
  }

  @Post("storage/objects/:objectId/attach-avatar")
  @RequireScopes("world:write")
  async attachAvatar(@CurrentSubject() subject: AuthSubject, @Param("objectId") objectId: string) {
    return this.storageService.attachAvatar(subject, objectId);
  }

  @Post("worlds/:worldId/cover")
  @RequireScopes("world:write")
  async attachWorldCover(
    @CurrentSubject() subject: AuthSubject,
    @Param("worldId") worldId: string,
    @Body() body: unknown,
  ) {
    const input = attachObjectSchema.parse(body);
    return this.storageService.attachWorldCover(subject, worldId, input.objectId);
  }

  @Post("repositories/:repositoryId/releases/:releaseId/attachments")
  @RequireScopes("world:write")
  async attachReleaseAttachment(
    @CurrentSubject() subject: AuthSubject,
    @Param("repositoryId") repositoryId: string,
    @Param("releaseId") releaseId: string,
    @Body() body: unknown,
  ) {
    const input = attachObjectSchema.parse(body);
    return this.storageService.attachReleaseAttachment(subject, repositoryId, releaseId, input.objectId);
  }
}
