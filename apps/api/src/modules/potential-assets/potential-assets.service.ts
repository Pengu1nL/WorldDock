import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AGENT_SESSIONS_REPOSITORY,
  type AgentSessionsRepository,
} from "../agent-sessions/agent-sessions.repository";
import { AGENT_REPOSITORY, type AgentRepository } from "../agent/agent.repository";
import { PotentialAssetsAnalyzer } from "./potential-assets.analyzer";
import {
  InvalidPotentialAssetListCursorError,
  POTENTIAL_ASSETS_REPOSITORY,
  type CreatePotentialAssetRecordInput,
  type ListPotentialAssetsForWorldQuery,
  type PotentialAssetRecord,
  type PotentialAssetsRepository,
} from "./potential-assets.repository";

type AnalyzeCompletedRunInput = {
  worldId: string;
  sessionId: string;
  runId: string;
};

@Injectable()
export class PotentialAssetsService {
  constructor(
    @Inject(POTENTIAL_ASSETS_REPOSITORY) private readonly potentialAssets: PotentialAssetsRepository,
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(AGENT_SESSIONS_REPOSITORY) private readonly sessions: AgentSessionsRepository,
    private readonly analyzer: PotentialAssetsAnalyzer,
  ) {}

  async analyzeCompletedRun(input: AnalyzeCompletedRunInput): Promise<PotentialAssetRecord[]> {
    const run = await this.agents.findRunById(input.runId);
    if (!run || run.worldId !== input.worldId || run.sessionId !== input.sessionId || run.status !== "completed") {
      return [];
    }

    const session = await this.sessions.findSessionForWorld(input.worldId, input.sessionId);
    if (!session || session.kind !== "world_exploration") return [];

    const messages = await this.sessions.listMessages(input.sessionId);
    const extracted = this.analyzer.extract({
      worldId: input.worldId,
      sessionId: input.sessionId,
      runId: input.runId,
      messages,
    });

    const existing = await this.potentialAssets.listForSession(input.worldId, input.sessionId);
    const seen = new Set(
      existing
        .filter((asset) => asset.status === "active")
        .map((asset) => dedupeKey(asset)),
    );
    const createInputs: CreatePotentialAssetRecordInput[] = [];

    for (const item of extracted) {
      const key = dedupeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      createInputs.push({
        worldId: input.worldId,
        sessionId: input.sessionId,
        runId: input.runId,
        type: item.type,
        title: item.title,
        summary: item.summary,
        evidence: item.evidence,
        status: "active",
        metadata: {},
      });
    }

    return this.potentialAssets.createMany(createInputs);
  }

  async listForSession(worldId: string, sessionId: string) {
    const session = await this.sessions.findSessionForWorld(worldId, sessionId);
    if (!session) throw this.notFound();
    return { potentialAssets: await this.potentialAssets.listForSession(worldId, sessionId), nextCursor: null };
  }

  async listForRun(worldId: string, runId: string) {
    return { potentialAssets: await this.potentialAssets.listForRun(worldId, runId), nextCursor: null };
  }

  async listForWorld(worldId: string, query?: ListPotentialAssetsForWorldQuery) {
    if (query?.cursor) {
      try {
        return await this.potentialAssets.listForWorld(worldId, query);
      } catch (error) {
        if (error instanceof InvalidPotentialAssetListCursorError) throw this.badCursor();
        throw error;
      }
    }
    return this.potentialAssets.listForWorld(worldId, query);
  }

  async updateStatus(worldId: string, id: string, status: PotentialAssetRecord["status"]) {
    const asset = await this.potentialAssets.updateStatus(worldId, id, status);
    if (!asset) throw this.notFound();
    return asset;
  }

  private notFound() {
    return new NotFoundException({
      code: "NOT_FOUND",
      message: "Potential asset not found.",
    });
  }

  private badCursor() {
    return new BadRequestException({
      code: "BAD_REQUEST",
      message: "Invalid potential asset cursor.",
    });
  }
}

function dedupeKey(item: Pick<PotentialAssetRecord, "type" | "title">) {
  return `${item.type}:${item.title.trim().toLocaleLowerCase()}`;
}
