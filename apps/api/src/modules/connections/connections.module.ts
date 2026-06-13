import { Module } from "@nestjs/common";
import { ConnectionsController } from "./connections.controller";
import {
  ConnectionsService,
  HUB_CONNECTION_FETCH,
  HUB_CONNECTION_STORE,
  PrismaHubConnectionStore,
} from "./connections.service";

@Module({
  controllers: [ConnectionsController],
  providers: [
    ConnectionsService,
    PrismaHubConnectionStore,
    {
      provide: HUB_CONNECTION_STORE,
      useExisting: PrismaHubConnectionStore,
    },
    {
      provide: HUB_CONNECTION_FETCH,
      useValue: fetch.bind(globalThis),
    },
  ],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
