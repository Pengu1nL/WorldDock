import { Body, Controller, HttpCode, Inject, Param, Patch, Post, Sse, type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { z } from "zod";
import { AgentService } from "./agent.service";

const createRunSchema = z.object({
  prompt: z.string().min(1),
});

const createWorldDraftSchema = z.object({
  inspiration: z.string().trim().min(1),
  name: z.string().trim().optional(),
  type: z.string().trim().optional(),
  styleKw: z.string().trim().optional(),
  avoid: z.string().trim().optional(),
});

@Controller()
export class AgentController {
  constructor(@Inject(AgentService) private readonly agentService: AgentService) {}

  @Post("world-drafts")
  async createWorldDraft(@Body() body: unknown) {
    return this.agentService.generateWorldDraft(createWorldDraftSchema.parse(body));
  }

  @Post("worlds/:worldId/agent-runs")
  async createRun(@Param("worldId") worldId: string, @Body() body: unknown) {
    const input = createRunSchema.parse(body);
    const result = await this.agentService.createRun(worldId, input);
    return {
      run: serializeAgentRun(result.run),
      suggestions: result.suggestions,
    };
  }

  @Sse("agent-runs/:runId/events")
  events(@Param("runId") runId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const event of this.agentService.streamEvents(runId)) {
            subscriber.next({
              id: event.id,
              type: event.type,
              data: {
                ...event,
                createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
              },
            });
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  @Post("agent-runs/:runId/cancel")
  @HttpCode(200)
  async cancel(@Param("runId") runId: string) {
    return { run: serializeAgentRun(await this.agentService.cancelRun(runId)) };
  }

  @Post("agent-suggestions/:suggestionId/save")
  async save(@Param("suggestionId") suggestionId: string) {
    return this.agentService.saveSuggestion(suggestionId);
  }

  @Patch("agent-suggestions/:suggestionId")
  async edit(@Param("suggestionId") suggestionId: string, @Body() body: unknown) {
    const input = z.object({ suggestion: z.unknown() }).parse(body);
    return { suggestion: await this.agentService.editSuggestion(suggestionId, input) };
  }

  @Post("agent-suggestions/:suggestionId/discard")
  async discard(@Param("suggestionId") suggestionId: string) {
    return { suggestion: await this.agentService.discardSuggestion(suggestionId) };
  }
}

function serializeAgentRun<T extends { mode?: unknown }>(run: T) {
  const response = { ...run };
  delete response.mode;
  return response;
}
