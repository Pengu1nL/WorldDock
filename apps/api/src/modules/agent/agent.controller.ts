import { Body, Controller, HttpCode, Inject, Param, Patch, Post, Sse, UseGuards, type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { z } from "zod";
import { CurrentSubject, RequireScopes } from "../auth/auth.decorators";
import { WorldDockAuthGuard } from "../auth/auth.guard";
import type { AuthSubject } from "../auth/auth.service";
import { AgentService } from "./agent.service";

const createRunSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["expand", "challenge", "fork", "polish"]).default("expand"),
});

const createWorldDraftSchema = z.object({
  inspiration: z.string().trim().min(1),
  name: z.string().trim().optional(),
  type: z.string().trim().optional(),
  styleKw: z.string().trim().optional(),
  avoid: z.string().trim().optional(),
});

@Controller()
@UseGuards(WorldDockAuthGuard)
export class AgentController {
  constructor(@Inject(AgentService) private readonly agentService: AgentService) {}

  @Post("world-drafts")
  @RequireScopes("world:write")
  async createWorldDraft(@CurrentSubject() subject: AuthSubject, @Body() body: unknown) {
    return this.agentService.generateWorldDraft(subject, createWorldDraftSchema.parse(body));
  }

  @Post("worlds/:worldId/agent-runs")
  @RequireScopes("world:write")
  async createRun(@CurrentSubject() subject: AuthSubject, @Param("worldId") worldId: string, @Body() body: unknown) {
    const input = createRunSchema.parse(body);
    const result = await this.agentService.createRun(subject, worldId, input);
    return {
      run: result.run,
      suggestions: result.suggestions,
    };
  }

  @Sse("agent-runs/:runId/events")
  @RequireScopes("world:read")
  events(@CurrentSubject() subject: AuthSubject, @Param("runId") runId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      void (async () => {
        try {
          for await (const event of this.agentService.streamEvents(subject, runId)) {
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
  @RequireScopes("world:write")
  @HttpCode(200)
  async cancel(@CurrentSubject() subject: AuthSubject, @Param("runId") runId: string) {
    return { run: await this.agentService.cancelRun(subject, runId) };
  }

  @Post("agent-suggestions/:suggestionId/save")
  @RequireScopes("world:write")
  async save(@CurrentSubject() subject: AuthSubject, @Param("suggestionId") suggestionId: string) {
    return this.agentService.saveSuggestion(subject, suggestionId);
  }

  @Patch("agent-suggestions/:suggestionId")
  @RequireScopes("world:write")
  async edit(@CurrentSubject() subject: AuthSubject, @Param("suggestionId") suggestionId: string, @Body() body: unknown) {
    const input = z.object({ suggestion: z.unknown() }).parse(body);
    return { suggestion: await this.agentService.editSuggestion(subject, suggestionId, input) };
  }

  @Post("agent-suggestions/:suggestionId/discard")
  @RequireScopes("world:write")
  async discard(@CurrentSubject() subject: AuthSubject, @Param("suggestionId") suggestionId: string) {
    return { suggestion: await this.agentService.discardSuggestion(subject, suggestionId) };
  }
}
