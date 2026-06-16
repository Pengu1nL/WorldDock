import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication } from "@nestjs/common";
import type { OfficialWorldAssetType } from "@worlddock/contract/assets";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_SESSIONS_REPOSITORY } from "../src/modules/agent-sessions/agent-sessions.repository";
import { AgentSessionsService } from "../src/modules/agent-sessions/agent-sessions.service";
import { LocalStorageService } from "../src/modules/local-storage/local-storage.service";
import { OfficialAssetsController } from "../src/modules/official-assets/official-assets.controller";
import {
  OFFICIAL_ASSETS_REPOSITORY,
  OfficialAssetPatchAlreadyRevertedError,
  OfficialAssetPatchConflictError,
  type ApplyOfficialAssetPatchRecordInput,
  type CreateOfficialAssetRecordInput,
  type ListOfficialAssetsQuery,
  type OfficialAssetDetailRecord,
  type OfficialAssetPatchesRepository,
  type OfficialAssetPatchRecord,
  type OfficialAssetRecord,
  type OfficialAssetRevisionRecord,
  type OfficialAssetsRepository,
  type OfficialAssetSectionIndexRecord,
  type RevertOfficialAssetPatchRecordInput,
  type UpdateOfficialAssetRecordInput,
} from "../src/modules/official-assets/official-assets.repository";
import { OfficialAssetsService } from "../src/modules/official-assets/official-assets.service";
import { WorldAssetPatchesService } from "../src/modules/official-assets/world-asset-patches.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import {
  createHttpTestApp,
  createInMemoryAgentSessions,
  createInMemoryWorlds,
  type InMemoryAgentSessions,
  type InMemoryWorlds,
} from "./local-api-test-helpers";

describe("asset edit local endpoints", () => {
  let app: INestApplication | undefined;
  let dataDir: string;
  let previousDataDir: string | undefined;
  let worlds: InMemoryWorlds;
  let world: Awaited<ReturnType<InMemoryWorlds["createWorld"]>>;
  let agentSessions: InMemoryAgentSessions;
  let officialAssets: InMemoryOfficialAssets;

  beforeEach(async () => {
    previousDataDir = process.env.WORLD_DOCK_DATA_DIR;
    dataDir = await mkdtemp(join(tmpdir(), "worlddock-asset-edit-"));
    process.env.WORLD_DOCK_DATA_DIR = dataDir;

    worlds = createInMemoryWorlds();
    world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "local",
      maturity: 12,
    });
    agentSessions = createInMemoryAgentSessions();
    officialAssets = createInMemoryOfficialAssets();
    app = await createAssetEditApp(worlds, agentSessions, officialAssets);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (previousDataDir === undefined) {
      delete process.env.WORLD_DOCK_DATA_DIR;
    } else {
      process.env.WORLD_DOCK_DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  it("creates an asset edit session from an official asset", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");

    const created = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .send({ title: "调整记忆交易许可" })
      .expect(201);

    expect(created.body.session).toMatchObject({
      worldId: world.id,
      kind: "asset_edit",
      title: "调整记忆交易许可",
      current: false,
    });
    expect(created.body.subjects).toEqual([
      expect.objectContaining({ subjectKind: "asset", subjectId: asset.id, role: "primary" }),
    ]);
    expect(created.body.contextItems).toEqual([
      expect.objectContaining({
        kind: "asset_document",
        targetId: asset.id,
        title: asset.name,
        summary: asset.summary,
        source: "initial",
        metadata: expect.objectContaining({
          documentKey: asset.documentKey,
          version: asset.version,
          source: "initial",
        }),
      }),
    ]);
  });

  it("applies a markdown patch and creates revision", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);
    const patch = await applyPatch(asset.id, "# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。", {
      sessionId: session.id,
      reason: "补充续期规则",
    });

    expect(patch).toMatchObject({
      assetId: asset.id,
      sessionId: session.id,
      status: "applied",
      assetVersionFrom: 1,
      assetVersionTo: 2,
    });
    expect(patch.diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "add", text: expect.stringContaining("续期") }),
    ]));

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(2);
    expect(detail.asset.summary).toBe("登记许可必须每年续期。");
    expect(detail.markdown).toContain("每年续期");
    expect(detail.revisions).toHaveLength(2);
    expect(detail.revisions[0]).toMatchObject({
      version: 2,
      summary: "登记许可必须每年续期。",
    });
  });

  it("reverts an applied patch", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const patch = await applyPatch(asset.id, "# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。");

    const reverted = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches/${patch.id}/revert`)
      .expect(200);

    expect(reverted.body.patch).toMatchObject({ id: patch.id, status: "reverted" });
    expect(reverted.body.patch.revertedAt).toEqual(expect.any(String));

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(3);
    expect(detail.asset.summary).toBe("所有记忆交易都需要登记。");
    expect(detail.markdown).not.toContain("每年续期");
    expect(detail.markdown).toBe("# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。");
    expect(detail.revisions).toHaveLength(3);
    expect(detail.revisions[0]).toMatchObject({
      version: 3,
      summary: "所有记忆交易都需要登记。",
      metadata: expect.objectContaining({
        source: "patch_revert",
        patchId: patch.id,
        reason: `Revert patch ${patch.id}`,
      }),
    });
    expect(detail.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "概括",
        summary: "所有记忆交易都需要登记。",
      }),
    ]));
  });

  it("returns 409 when reverting a patch twice without changing the asset again", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const patch = await applyPatch(asset.id, "# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。");

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches/${patch.id}/revert`)
      .expect(200);
    const afterFirstRevert = await getOfficialAsset(asset.id);

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches/${patch.id}/revert`)
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "PATCH_ALREADY_REVERTED",
          message: "World asset patch has already been reverted.",
        });
      });

    const afterSecondRevert = await getOfficialAsset(asset.id);
    expect(afterSecondRevert.asset.version).toBe(afterFirstRevert.asset.version);
    expect(afterSecondRevert.markdown).toBe(afterFirstRevert.markdown);
    expect(afterSecondRevert.revisions).toHaveLength(afterFirstRevert.revisions.length);
  });

  it("does not expose patch revert across worlds or assets", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const otherAsset = await createOfficialAsset("rule", "白塔许可");
    const patch = await applyPatch(asset.id, "# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。");
    const otherWorld = await worlds.createWorld({
      name: "白塔城",
      type: "奇幻",
      summary: "白塔管理整座城市的记忆。",
      tags: ["白塔"],
      mode: "local",
      maturity: 12,
    });

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${otherAsset.id}/patches/${patch.id}/revert`)
      .expect(404);
    await request(app?.getHttpServer())
      .post(`/v1/worlds/${otherWorld.id}/official-assets/${asset.id}/patches/${patch.id}/revert`)
      .expect(404);

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(2);
    expect(detail.markdown).toContain("每年续期");
  });

  it("rejects patches from non asset edit sessions without changing the asset", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await agentSessions.createSession({
      worldId: world.id,
      kind: "world_exploration",
      title: "世界探索",
      status: "active",
      current: false,
      metadata: {},
    });

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: "# 记忆交易许可\n\n## 概括\n\n非法更新。",
      })
      .expect(400);

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(1);
    expect(detail.markdown).toContain("所有记忆交易都需要登记。");
  });

  it("rejects patches when the session primary subject is another asset", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const otherAsset = await createOfficialAsset("rule", "白塔许可");
    const otherSession = await createAssetEditSession(otherAsset.id);

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: otherSession.id,
        afterMarkdown: "# 记忆交易许可\n\n## 概括\n\n非法更新。",
      })
      .expect(400);

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(1);
    expect(detail.markdown).toContain("所有记忆交易都需要登记。");
  });

  it("does not expose patch list or detail across worlds", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);
    const applied = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: "# 记忆交易许可\n\n## 概括\n\n登记许可必须每年续期。",
      })
      .expect(201);
    const otherWorld = await worlds.createWorld({
      name: "白塔城",
      type: "奇幻",
      summary: "白塔管理整座城市的记忆。",
      tags: ["白塔"],
      mode: "local",
      maturity: 12,
    });

    await request(app?.getHttpServer())
      .get(`/v1/worlds/${otherWorld.id}/official-assets/${asset.id}/patches`)
      .expect(404);
    await request(app?.getHttpServer())
      .get(`/v1/worlds/${otherWorld.id}/official-assets/${asset.id}/patches/${applied.body.patch.id}`)
      .expect(404);
  });

  it("rejects patches with an empty summary section before writing storage or database records", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: "# 记忆交易许可\n\n## 概括\n\n  \n\n## 适用范围\n\n所有许可。",
      })
      .expect(400);

    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(1);
    expect(detail.markdown).toBe("# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。");
    expect(detail.revisions).toHaveLength(1);
    await request(app?.getHttpServer())
      .get(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.patches).toEqual([]);
      });
  });

  it("rejects oversized markdown patches before diffing or writing records", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);
    const oversizedMarkdown = [
      "# 记忆交易许可",
      "",
      "## 概括",
      "",
      "这份补丁正文过长。",
      ...Array.from({ length: 1000 }, (_, index) => `- 第 ${index + 1} 条超限内容`),
    ].join("\n");

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: oversizedMarkdown,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain("line limit");
      });

    const storedMarkdown = await readStoredMarkdown(asset.documentKey);
    expect(storedMarkdown).toBe("# 记忆交易许可\n\n## 概括\n\n所有记忆交易都需要登记。");
    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(1);
    expect(detail.revisions).toHaveLength(1);
    await request(app?.getHttpServer())
      .get(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.patches).toEqual([]);
      });
  });

  it("returns 409 on patch conflicts and restores storage to the latest database revision", async () => {
    const latestMarkdown = "# 记忆交易许可\n\n## 概括\n\n另一个补丁已经成功写入。";
    await app?.close();
    officialAssets = createInMemoryOfficialAssets({ conflictOnApply: { markdown: latestMarkdown } });
    app = await createAssetEditApp(worlds, agentSessions, officialAssets);
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: "# 记忆交易许可\n\n## 概括\n\n这次失败的补丁不应留在文件里。",
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "PATCH_CONFLICT",
          message: "Official asset changed while applying patch.",
        });
      });

    const storedMarkdown = await readStoredMarkdown(asset.documentKey);
    expect(storedMarkdown).toBe(latestMarkdown);
    expect(storedMarkdown).not.toContain("失败的补丁");
    const detail = await getOfficialAsset(asset.id);
    expect(detail.asset.version).toBe(2);
    expect(detail.markdown).toBe(latestMarkdown);
  });

  it("does not overwrite a newer storage write during conflict compensation", async () => {
    const latestMarkdown = "# 记忆交易许可\n\n## 概括\n\nDB 中较早的成功补丁。";
    const failedAfterMarkdown = "# 记忆交易许可\n\n## 概括\n\n这次失败的补丁不应留在文件里。";
    const racingMarkdown = "# 记忆交易许可\n\n## 概括\n\n补偿前另一个补丁已经写入文件。";
    await app?.close();
    officialAssets = createInMemoryOfficialAssets({ conflictOnApply: { markdown: latestMarkdown } });
    app = await createAssetEditApp(worlds, agentSessions, officialAssets, createRacingLocalStorageService({
      failedAfterMarkdown,
      latestMarkdown,
      racingMarkdown,
    }));
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const session = await createAssetEditSession(asset.id);

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/patches`)
      .send({
        sessionId: session.id,
        afterMarkdown: failedAfterMarkdown,
      })
      .expect(409);

    const storedMarkdown = await readStoredMarkdown(asset.documentKey);
    expect(storedMarkdown).toBe(racingMarkdown);
    expect(storedMarkdown).not.toBe(latestMarkdown);
    expect(storedMarkdown).not.toBe(failedAfterMarkdown);
  });

  it("creates default titled asset edit sessions when the body is omitted or empty", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");

    const omittedBody = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .expect(201);

    expect(omittedBody.body.session).toMatchObject({
      worldId: world.id,
      kind: "asset_edit",
      title: "Asset edit",
      current: false,
    });

    const emptyBody = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .send({})
      .expect(201);

    expect(emptyBody.body.session).toMatchObject({
      worldId: world.id,
      kind: "asset_edit",
      title: "Asset edit",
      current: false,
    });
  });

  it("returns 404 and creates no session when the official asset is missing", async () => {
    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/missing/edit-sessions`)
      .expect(404);

    await expect(agentSessions.listSessions(world.id, { kind: "asset_edit" })).resolves.toMatchObject({
      sessions: [],
    });
  });

  it("returns 404 and creates no session when the asset belongs to another world", async () => {
    const asset = await createOfficialAsset("rule", "记忆交易许可");
    const otherWorld = await worlds.createWorld({
      name: "白塔城",
      type: "奇幻",
      summary: "白塔管理整座城市的记忆。",
      tags: ["白塔"],
      mode: "local",
      maturity: 12,
    });

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${otherWorld.id}/official-assets/${asset.id}/edit-sessions`)
      .expect(404);

    await expect(agentSessions.listSessions(otherWorld.id, { kind: "asset_edit" })).resolves.toMatchObject({
      sessions: [],
    });
  });

  it("does not leave an asset edit session when initial context creation fails", async () => {
    const sessions = createInMemoryAgentSessions({ failContextItemKinds: new Set<"asset_document">(["asset_document"]) });
    await app?.close();
    app = await createAssetEditApp(worlds, sessions);
    const asset = await createOfficialAsset("rule", "记忆交易许可");

    await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${asset.id}/edit-sessions`)
      .send({ title: "调整记忆交易许可" })
      .expect(500);

    await expect(sessions.listSessions(world.id, { kind: "asset_edit" })).resolves.toMatchObject({
      sessions: [],
    });
    expect(sessions.stores.sessions.size).toBe(0);
    expect(sessions.stores.subjects).toEqual([]);
    expect(sessions.stores.contextItems).toEqual([]);
  });

  async function createOfficialAsset(type: OfficialWorldAssetType, name: string) {
    const created = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets`)
      .send({
        type,
        name,
        summary: "所有记忆交易都需要登记。",
        markdown: `# ${name}\n\n## 概括\n\n所有记忆交易都需要登记。`,
        tags: ["法律"],
      })
      .expect(201);

    return created.body.asset as OfficialAssetRecord;
  }

  async function createAssetEditSession(assetId: string) {
    const created = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${assetId}/edit-sessions`)
      .send({})
      .expect(201);

    return created.body.session as { id: string };
  }

  async function applyPatch(
    assetId: string,
    afterMarkdown: string,
    options: { sessionId?: string; reason?: string } = {},
  ) {
    const sessionId = options.sessionId ?? (await createAssetEditSession(assetId)).id;
    const applied = await request(app?.getHttpServer())
      .post(`/v1/worlds/${world.id}/official-assets/${assetId}/patches`)
      .send({
        sessionId,
        afterMarkdown,
        reason: options.reason,
      })
      .expect(201);

    return applied.body.patch as OfficialAssetPatchRecord & { diff: unknown };
  }

  async function getOfficialAsset(assetId: string) {
    const detail = await request(app?.getHttpServer())
      .get(`/v1/worlds/${world.id}/official-assets/${assetId}`)
      .expect(200);

    return detail.body as {
      asset: OfficialAssetRecord;
      markdown: string;
      indexes: Array<{ title: string; summary: string | null; metadata: Record<string, unknown> }>;
      revisions: Array<{
        version: number;
        markdown: string;
        summary: string | null;
        metadata: Record<string, unknown>;
      }>;
    };
  }

  async function readStoredMarkdown(documentKey: string) {
    const stored = await app?.get(LocalStorageService).readObject(documentKey);
    if (!stored) throw new Error("Expected stored markdown.");
    return new TextDecoder().decode(stored.body);
  }
});

async function createAssetEditApp(
  worlds: InMemoryWorlds,
  sessions: InMemoryAgentSessions = createInMemoryAgentSessions(),
  officialAssets: InMemoryOfficialAssets = createInMemoryOfficialAssets(),
  localStorage: LocalStorageService = new LocalStorageService(),
) {
  return createHttpTestApp({
    controllers: [OfficialAssetsController],
    providers: [
      AgentSessionsService,
      OfficialAssetsService,
      WorldAssetPatchesService,
      { provide: LocalStorageService, useValue: localStorage },
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: AGENT_SESSIONS_REPOSITORY, useValue: sessions },
      { provide: OFFICIAL_ASSETS_REPOSITORY, useValue: officialAssets },
    ],
  });
}

function createRacingLocalStorageService(input: {
  failedAfterMarkdown: string;
  latestMarkdown: string;
  racingMarkdown: string;
}) {
  const delegate = new LocalStorageService();
  let pendingRace = false;

  return {
    async saveObject(saveInput: Parameters<LocalStorageService["saveObject"]>[0]) {
      const markdown = new TextDecoder().decode(saveInput.body);
      if (markdown === input.failedAfterMarkdown) pendingRace = true;
      if (markdown === input.latestMarkdown && pendingRace) pendingRace = false;
      return delegate.saveObject(saveInput);
    },
    async readObject(key: string) {
      return delegate.readObject(key);
    },
    async saveObjectIfCurrentBodyEquals(saveInput: Parameters<LocalStorageService["saveObjectIfCurrentBodyEquals"]>[0]) {
      if (pendingRace) {
        pendingRace = false;
        await delegate.saveObject({
          key: saveInput.key,
          contentType: "text/markdown; charset=utf-8",
          body: new TextEncoder().encode(input.racingMarkdown),
        });
      }
      return delegate.saveObjectIfCurrentBodyEquals(saveInput);
    },
    async deleteObject(key: string) {
      await delegate.deleteObject(key);
    },
  } as LocalStorageService;
}

type InMemoryOfficialAssets = OfficialAssetsRepository & OfficialAssetPatchesRepository;

type InMemoryOfficialAssetsOptions = {
  conflictOnApply?: {
    markdown: string;
  };
};

function createInMemoryOfficialAssets(options: InMemoryOfficialAssetsOptions = {}): InMemoryOfficialAssets {
  const assets = new Map<string, OfficialAssetRecord>();
  const revisions = new Map<string, OfficialAssetRevisionRecord[]>();
  const indexes = new Map<string, OfficialAssetSectionIndexRecord[]>();
  const patches = new Map<string, OfficialAssetPatchRecord[]>();
  let assetCount = 1;
  let revisionCount = 1;
  let indexCount = 1;
  let patchCount = 1;

  return {
    async createAsset(input: CreateOfficialAssetRecordInput) {
      const timestamp = new Date();
      const asset: OfficialAssetRecord = {
        id: `official_asset_${assetCount++}`,
        worldId: input.worldId,
        type: input.type,
        name: input.name,
        summary: input.summary,
        documentKey: input.documentKey,
        status: "active",
        version: 1,
        tags: [...(input.tags ?? [])],
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };
      const revision: OfficialAssetRevisionRecord = {
        id: `official_asset_revision_${revisionCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        version: 1,
        markdown: input.initialRevision.markdown,
        summary: input.initialRevision.summary,
        metadata: input.initialRevision.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const sectionIndexes = input.indexes.map((section) => ({
        id: `official_asset_index_${indexCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        title: section.title,
        summary: section.summary ?? null,
        metadata: section.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

      assets.set(asset.id, asset);
      revisions.set(asset.id, [revision]);
      indexes.set(asset.id, sectionIndexes);
      patches.set(asset.id, []);
      return { asset, revisions: [revision], indexes: sectionIndexes };
    },
    async updateAsset(
      worldId: string,
      assetId: string,
      input: UpdateOfficialAssetRecordInput,
    ): Promise<OfficialAssetDetailRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      const updated: OfficialAssetRecord = { ...asset, ...input, updatedAt: new Date() };
      assets.set(asset.id, updated);
      return {
        asset: updated,
        revisions: revisions.get(asset.id) ?? [],
        indexes: indexes.get(asset.id) ?? [],
      };
    },
    async listAssets(worldId: string, query: ListOfficialAssetsQuery = {}) {
      const filtered = [...assets.values()]
        .filter((asset) => asset.worldId === worldId)
        .filter((asset) => !query.type || asset.type === query.type)
        .filter((asset) => !query.q || `${asset.name}\n${asset.summary}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()));
      return { assets: filtered, nextCursor: null };
    },
    async getAsset(worldId: string, assetId: string): Promise<OfficialAssetDetailRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      return {
        asset,
        revisions: revisions.get(asset.id) ?? [],
        indexes: indexes.get(asset.id) ?? [],
      };
    },
    async applyPatch(input: ApplyOfficialAssetPatchRecordInput): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(input.assetId);
      if (!asset || asset.worldId !== input.worldId) return null;
      const timestamp = new Date();
      const existingRevisions = revisions.get(asset.id) ?? [];
      if (options.conflictOnApply) {
        const versionTo = asset.version + 1;
        const latestMarkdown = options.conflictOnApply.markdown;
        const latestSummary = "另一个补丁已经成功写入。";
        const updated: OfficialAssetRecord = {
          ...asset,
          summary: latestSummary,
          version: versionTo,
          updatedAt: timestamp,
        };
        const revision: OfficialAssetRevisionRecord = {
          id: `official_asset_revision_${revisionCount++}`,
          worldId: input.worldId,
          assetId: asset.id,
          version: versionTo,
          markdown: latestMarkdown,
          summary: latestSummary,
          metadata: { source: "concurrent_patch" },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        assets.set(asset.id, updated);
        revisions.set(asset.id, [revision, ...existingRevisions]);
        throw new OfficialAssetPatchConflictError();
      }
      if (
        asset.version !== input.expectedVersion ||
        (existingRevisions[0]?.id ?? null) !== input.expectedBeforeRevisionId
      ) {
        throw new OfficialAssetPatchConflictError();
      }
      const versionFrom = input.expectedVersion;
      const versionTo = input.expectedVersion + 1;
      const updated: OfficialAssetRecord = {
        ...asset,
        summary: input.summary,
        version: versionTo,
        updatedAt: timestamp,
      };
      const revision: OfficialAssetRevisionRecord = {
        id: `official_asset_revision_${revisionCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        version: versionTo,
        markdown: input.afterMarkdown,
        summary: input.summary,
        metadata: { sessionId: input.sessionId, source: "patch" },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const sectionIndexes = input.indexes.map((section) => ({
        id: `official_asset_index_${indexCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        title: section.title,
        summary: section.summary ?? null,
        metadata: section.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      const patch: OfficialAssetPatchRecord = {
        id: `world_asset_patch_${patchCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        sessionId: input.sessionId,
        batchId: null,
        beforeRevisionId: input.expectedBeforeRevisionId,
        afterRevisionId: revision.id,
        beforeMarkdown: input.beforeMarkdown,
        afterMarkdown: input.afterMarkdown,
        diff: input.diff,
        assetVersionFrom: versionFrom,
        assetVersionTo: versionTo,
        status: "applied",
        metadata: { ...(input.metadata ?? {}), sessionId: input.sessionId },
        createdAt: timestamp,
        updatedAt: timestamp,
        appliedAt: timestamp,
        revertedAt: null,
      };

      assets.set(asset.id, updated);
      revisions.set(asset.id, [revision, ...existingRevisions]);
      indexes.set(asset.id, sectionIndexes);
      patches.set(asset.id, [patch, ...(patches.get(asset.id) ?? [])]);
      return patch;
    },
    async listPatches(worldId: string, assetId: string): Promise<OfficialAssetPatchRecord[]> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return [];
      return patches.get(assetId) ?? [];
    },
    async getPatch(worldId: string, assetId: string, patchId: string): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(assetId);
      if (!asset || asset.worldId !== worldId) return null;
      return (patches.get(assetId) ?? []).find((patch) => patch.id === patchId) ?? null;
    },
    async revertPatch(input: RevertOfficialAssetPatchRecordInput): Promise<OfficialAssetPatchRecord | null> {
      const asset = assets.get(input.assetId);
      if (!asset || asset.worldId !== input.worldId) return null;
      const patchList = patches.get(asset.id) ?? [];
      const patchIndex = patchList.findIndex((patch) => patch.id === input.patchId);
      if (patchIndex === -1) return null;
      const patch = patchList[patchIndex];
      if (patch.status !== "applied") throw new OfficialAssetPatchAlreadyRevertedError();
      const existingRevisions = revisions.get(asset.id) ?? [];
      if (
        asset.version !== input.expectedVersion ||
        (existingRevisions[0]?.id ?? null) !== input.expectedLatestRevisionId
      ) {
        throw new OfficialAssetPatchConflictError();
      }

      const timestamp = new Date();
      const versionTo = input.expectedVersion + 1;
      const updated: OfficialAssetRecord = {
        ...asset,
        summary: input.summary,
        version: versionTo,
        updatedAt: timestamp,
      };
      const revision: OfficialAssetRevisionRecord = {
        id: `official_asset_revision_${revisionCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        version: versionTo,
        markdown: input.markdown,
        summary: input.summary,
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const sectionIndexes = input.indexes.map((section) => ({
        id: `official_asset_index_${indexCount++}`,
        worldId: input.worldId,
        assetId: asset.id,
        title: section.title,
        summary: section.summary ?? null,
        metadata: section.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      const revertedPatch: OfficialAssetPatchRecord = {
        ...patch,
        status: "reverted",
        updatedAt: timestamp,
        revertedAt: timestamp,
      };

      assets.set(asset.id, updated);
      revisions.set(asset.id, [revision, ...existingRevisions]);
      indexes.set(asset.id, sectionIndexes);
      patches.set(asset.id, [
        ...patchList.slice(0, patchIndex),
        revertedPatch,
        ...patchList.slice(patchIndex + 1),
      ]);
      return revertedPatch;
    },
  };
}
