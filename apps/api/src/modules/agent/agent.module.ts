import { forwardRef, Module } from "@nestjs/common";
import { AgentSessionsModule } from "../agent-sessions/agent-sessions.module";
import { OfficialAssetsModule } from "../official-assets/official-assets.module";
import { OfficialAssetsService } from "../official-assets/official-assets.service";
import { PotentialAssetsModule } from "../potential-assets/potential-assets.module";
import { WORLD_REPOSITORY, type WorldRepository } from "../worlds/world.repository";
import { WorldsModule } from "../worlds/worlds.module";
import { AgentController } from "./agent.controller";
import { AGENT_PROVIDER, PiAgentProvider } from "./agent.provider";
import { AGENT_REPOSITORY } from "./agent.repository";
import { AgentService } from "./agent.service";
import { createPiAgentCoreAdapter } from "./pi/pi-agent-core.adapter";
import { PiAgentCoreRuntimeClient } from "./pi/pi-runtime.client";
import { PiSessionRunner } from "./pi/pi-session-runner";
import { SafetyGate } from "./pi/safety-gate";
import { createWorldToolRegistry } from "./pi/world-tools";
import { PrismaAgentRepository } from "./prisma-agent.repository";

@Module({
  imports: [WorldsModule, AgentSessionsModule, OfficialAssetsModule, forwardRef(() => PotentialAssetsModule)],
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
      useFactory: (worlds: WorldRepository, officialAssets: OfficialAssetsService) => {
        const adapter = createPiAgentCoreAdapter({
          modelProvider: process.env.PI_MODEL_PROVIDER,
          modelId: process.env.PI_MODEL_ID,
          providerApiKey: process.env.PI_PROVIDER_API_KEY,
        });
        return new PiAgentProvider(
          new PiSessionRunner(
            new PiAgentCoreRuntimeClient(adapter),
            createWorldToolRegistry(worlds, officialAssets),
            new SafetyGate(),
          ),
        );
      },
      inject: [WORLD_REPOSITORY, OfficialAssetsService],
    },
  ],
  exports: [AgentService, AGENT_REPOSITORY, AGENT_PROVIDER],
})
export class AgentModule {}
