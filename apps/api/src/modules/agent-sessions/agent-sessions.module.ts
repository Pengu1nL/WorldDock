import { Module } from "@nestjs/common";
import { WorldsModule } from "../worlds/worlds.module";
import { AgentSessionsController } from "./agent-sessions.controller";
import { AGENT_SESSIONS_REPOSITORY } from "./agent-sessions.repository";
import { AgentSessionsService } from "./agent-sessions.service";
import { PrismaAgentSessionsRepository } from "./prisma-agent-sessions.repository";

@Module({
  imports: [WorldsModule],
  controllers: [AgentSessionsController],
  providers: [
    AgentSessionsService,
    PrismaAgentSessionsRepository,
    {
      provide: AGENT_SESSIONS_REPOSITORY,
      useExisting: PrismaAgentSessionsRepository,
    },
  ],
  exports: [AgentSessionsService, AGENT_SESSIONS_REPOSITORY],
})
export class AgentSessionsModule {}
