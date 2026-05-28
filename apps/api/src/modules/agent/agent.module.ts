import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { WorldsModule } from "../worlds/worlds.module";
import { AgentController } from "./agent.controller";
import { AGENT_PROVIDER, createAgentProviderFromEnv } from "./agent.provider";
import { AGENT_REPOSITORY } from "./agent.repository";
import { AgentService } from "./agent.service";
import { PrismaAgentRepository } from "./prisma-agent.repository";

@Module({
  imports: [AuthModule, BillingModule, WorldsModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    PrismaAgentRepository,
    {
      provide: AGENT_REPOSITORY,
      useExisting: PrismaAgentRepository,
    },
    {
      provide: AGENT_PROVIDER,
      useFactory: () => createAgentProviderFromEnv(process.env),
    },
  ],
  exports: [AgentService, AGENT_REPOSITORY, AGENT_PROVIDER],
})
export class AgentModule {}
