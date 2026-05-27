import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateStorageUploadInput } from "@worlddock/domain";
import type { AuthSubject } from "../auth/auth.service";
import { REPOSITORY_REPOSITORY, type RepositoryRepository } from "../repositories/repository.repository";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { STORAGE_REPOSITORY, type StorageObjectRecord, type StorageRepository } from "./storage.repository";
import { STORAGE_SIGNER, type StorageSigner } from "./storage.signer";

const maxUploadSizeBytes = 50 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/json",
  "application/zip",
  "application/vnd.worlddock.world-package+json",
  "text/plain",
]);

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_REPOSITORY) private readonly storage: StorageRepository,
    @Inject(STORAGE_SIGNER) private readonly signer: StorageSigner,
    @Inject(WORLD_REPOSITORY) private readonly worlds: WorldRepository,
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
  ) {}

  async createUploadUrl(subject: AuthSubject, input: CreateStorageUploadInput) {
    await this.validateUpload(subject, input);
    const object = await this.storage.createObject({
      ownerId: subject.user.id,
      bucket: process.env.S3_BUCKET ?? "worlddock-local",
      key: `${subject.user.id}/${input.purpose}/${randomUUID()}-${sanitizeFilename(input.filename)}`,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: null,
      purpose: input.purpose,
      visibility: input.visibility,
      worldId: input.worldId ?? null,
      repositoryId: input.repositoryId ?? null,
      releaseId: input.releaseId ?? null,
    });
    return { object: toStorageResponse(object), upload: await this.signer.createUploadUrl(object) };
  }

  async createDownloadUrl(subject: AuthSubject, objectId: string) {
    const object = await this.requireReadableObject(subject, objectId);
    if (object.visibility === "public") {
      return {
        object: toStorageResponse(object),
        download: {
          url: this.signer.publicUrl(object),
          method: "GET" as const,
          expiresAt: null,
        },
      };
    }
    return { object: toStorageResponse(object), download: await this.signer.createDownloadUrl(object) };
  }

  async attachAvatar(subject: AuthSubject, objectId: string) {
    const object = await this.requireOwnedObject(subject, objectId);
    if (object.purpose !== "avatar") throw this.badRequest("Object purpose must be avatar.");
    return { object: toStorageResponse(await this.attachExistingObject(object, {})) };
  }

  async attachWorldCover(subject: AuthSubject, worldId: string, objectId: string) {
    const world = await this.worlds.findWorldById(worldId);
    if (!world || world.ownerId !== subject.user.id) throw this.notFound("World not found.");
    const object = await this.requireOwnedObject(subject, objectId);
    if (object.purpose !== "world_cover") throw this.badRequest("Object purpose must be world_cover.");
    const attached = await this.attachExistingObject(object, { worldId });
    await this.worlds.updateWorld(world.id, { coverObjectId: attached.id });
    return { object: toStorageResponse(attached) };
  }

  async attachReleaseAttachment(subject: AuthSubject, repositoryId: string, releaseId: string, objectId: string) {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository || repository.ownerId !== subject.user.id) throw this.notFound("Repository not found.");
    const release = (await this.repositories.listReleases(repositoryId)).find((item) => item.id === releaseId);
    if (!release) throw this.notFound("Release not found.");
    const object = await this.requireOwnedObject(subject, objectId);
    if (object.purpose !== "release_attachment") throw this.badRequest("Object purpose must be release_attachment.");
    return { object: toStorageResponse(await this.attachExistingObject(object, { repositoryId, releaseId })) };
  }

  private async validateUpload(subject: AuthSubject, input: CreateStorageUploadInput) {
    if (input.sizeBytes > maxUploadSizeBytes) throw this.badRequest("File is too large.");
    if (!allowedMimeTypes.has(input.mimeType)) throw this.badRequest("Unsupported mime type.");
    if (input.purpose === "world_cover") {
      if (!input.worldId) throw this.badRequest("worldId is required for world_cover.");
      const world = await this.worlds.findWorldById(input.worldId);
      if (!world || world.ownerId !== subject.user.id) throw this.notFound("World not found.");
      if (!input.mimeType.startsWith("image/")) throw this.badRequest("World cover must be an image.");
    }
    if (input.purpose === "avatar" && !input.mimeType.startsWith("image/")) {
      throw this.badRequest("Avatar must be an image.");
    }
    if (input.purpose === "release_attachment") {
      if (!input.repositoryId || !input.releaseId) throw this.badRequest("repositoryId and releaseId are required for release_attachment.");
      const repository = await this.repositories.findById(input.repositoryId);
      if (!repository || repository.ownerId !== subject.user.id) throw this.notFound("Repository not found.");
      const release = (await this.repositories.listReleases(input.repositoryId)).find((item) => item.id === input.releaseId);
      if (!release) throw this.notFound("Release not found.");
    }
  }

  private async requireReadableObject(subject: AuthSubject, objectId: string) {
    const object = await this.storage.findObjectById(objectId);
    if (!object || object.status === "deleted") throw this.notFound("Object not found.");
    if (object.visibility === "private" && object.ownerId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not have access to this object." });
    }
    return object;
  }

  private async requireOwnedObject(subject: AuthSubject, objectId: string) {
    const object = await this.storage.findObjectById(objectId);
    if (!object || object.status === "deleted") throw this.notFound("Object not found.");
    if (object.ownerId !== subject.user.id) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "You do not own this object." });
    }
    return object;
  }

  private async attachExistingObject(object: StorageObjectRecord, input: Parameters<StorageRepository["attachObject"]>[1]) {
    const attached = await this.storage.attachObject(object.id, input);
    if (!attached) throw this.notFound("Object not found.");
    return attached;
  }

  private badRequest(message: string) {
    return new BadRequestException({ code: "VALIDATION_ERROR", message });
  }

  private notFound(message: string) {
    return new NotFoundException({ code: "NOT_FOUND", message });
  }
}

function toStorageResponse(object: StorageObjectRecord) {
  return {
    id: object.id,
    key: object.key,
    filename: object.filename,
    mimeType: object.mimeType,
    sizeBytes: object.sizeBytes,
    purpose: object.purpose,
    visibility: object.visibility,
    status: object.status,
    worldId: object.worldId,
    repositoryId: object.repositoryId,
    releaseId: object.releaseId,
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString(),
  };
}

function sanitizeFilename(filename: string) {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "file";
}
