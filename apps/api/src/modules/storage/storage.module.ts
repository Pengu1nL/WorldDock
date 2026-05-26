import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RepositoryModule } from "../repositories/repository.module";
import { WorldsModule } from "../worlds/worlds.module";
import { PrismaStorageRepository } from "./prisma-storage.repository";
import { StorageController } from "./storage.controller";
import { STORAGE_REPOSITORY } from "./storage.repository";
import { STORAGE_SIGNER, S3StorageSigner } from "./storage.signer";
import { StorageService } from "./storage.service";

@Module({
  imports: [AuthModule, RepositoryModule, WorldsModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    PrismaStorageRepository,
    {
      provide: STORAGE_REPOSITORY,
      useExisting: PrismaStorageRepository,
    },
    {
      provide: STORAGE_SIGNER,
      useClass: S3StorageSigner,
    },
  ],
  exports: [StorageService, STORAGE_REPOSITORY, STORAGE_SIGNER],
})
export class StorageModule {}
