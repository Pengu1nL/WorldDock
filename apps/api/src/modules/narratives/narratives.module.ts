import { Module } from "@nestjs/common";
import { AgentSessionsModule } from "../agent-sessions/agent-sessions.module";
import { WorldsModule } from "../worlds/worlds.module";
import { NARRATIVES_REPOSITORY } from "./narratives.repository";
import { NarrativesController } from "./narratives.controller";
import { NarrativesService } from "./narratives.service";
import { PrismaNarrativesRepository } from "./prisma-narratives.repository";
import { PiStoryProgressionAgent, STORY_PROGRESSION_AGENT } from "./story-progression-agent";

@Module({
  imports: [AgentSessionsModule, WorldsModule],
  controllers: [NarrativesController],
  providers: [
      NarrativesService,
      PrismaNarrativesRepository,
      PiStoryProgressionAgent,
      {
        provide: NARRATIVES_REPOSITORY,
        useExisting: PrismaNarrativesRepository,
      },
      {
        provide: STORY_PROGRESSION_AGENT,
        useExisting: PiStoryProgressionAgent,
      },
  ],
  exports: [NarrativesService, NARRATIVES_REPOSITORY],
})
export class NarrativesModule {}
