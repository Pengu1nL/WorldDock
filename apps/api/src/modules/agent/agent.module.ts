import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { WorldsModule } from "../worlds/worlds.module";
import { AgentController } from "./agent.controller";
import { AGENT_PROVIDER, MockAgentProvider, PiAgentProvider, VercelAiSdkAgentProvider } from "./agent.provider";
import { AGENT_REPOSITORY } from "./agent.repository";
import { AgentService } from "./agent.service";
import { createPiAgentCoreAdapter } from "./pi/pi-agent-core.adapter";
import { PiAgentCoreRuntimeClient } from "./pi/pi-runtime.client";
import { PiSessionRunner } from "./pi/pi-session-runner";
import { SafetyGate } from "./pi/safety-gate";
import { createWorldToolRegistry } from "./pi/world-tools";
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
      useFactory: (worlds: WorldRepository) => {
        if (process.env.AI_PROVIDER === "pi") {
          const adapter = createPiAgentCoreAdapter({
            modelProvider: process.env.PI_MODEL_PROVIDER,
            modelId: process.env.PI_MODEL_ID,
            providerApiKey: process.env.PI_PROVIDER_API_KEY,
          });
          return new PiAgentProvider(
            new PiSessionRunner(
              new PiAgentCoreRuntimeClient(adapter),
              createWorldToolRegistry(worlds),
              new SafetyGate(),
            ),
          );
        }
        if (process.env.AI_PROVIDER === "vercel-ai") return new VercelAiSdkAgentProvider();
        return new MockAgentProvider();
      },
      inject: [WORLD_REPOSITORY],
    },
  ],
  exports: [AgentService, AGENT_REPOSITORY, AGENT_PROVIDER],
})
export class AgentModule {}
