import { forwardRef, Module } from "@nestjs/common";
import { ConnectionsModule } from "../connections/connections.module";
import { ExportsService } from "../exports/exports.service";
import { OfficialAssetsModule } from "../official-assets/official-assets.module";
import { PULL_CLIENT_FETCH, PullClientService } from "../pull-client/pull-client.service";
import { PUSH_CLIENT_FETCH, PushClientService } from "../push-client/push-client.service";
import { PrismaWorldRepository } from "./prisma-world.repository";
import { WORLD_REPOSITORY } from "./world.repository";
import { WorldsController } from "./worlds.controller";

@Module({
  imports: [ConnectionsModule, forwardRef(() => OfficialAssetsModule)],
  controllers: [WorldsController],
  providers: [
    PrismaWorldRepository,
    ExportsService,
    PullClientService,
    PushClientService,
    {
      provide: WORLD_REPOSITORY,
      useExisting: PrismaWorldRepository,
    },
    {
      provide: PULL_CLIENT_FETCH,
      useValue: fetch.bind(globalThis),
    },
    {
      provide: PUSH_CLIENT_FETCH,
      useValue: fetch.bind(globalThis),
    },
  ],
  exports: [WORLD_REPOSITORY],
})
export class WorldsModule {}
