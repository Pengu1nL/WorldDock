import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { WorldAssetsController } from "../src/modules/world-assets/world-assets.controller";
import { WorldAssetsService } from "../src/modules/world-assets/world-assets.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import { createHttpTestApp, createInMemoryWorldAssets, createInMemoryWorlds, type InMemoryWorlds } from "./local-api-test-helpers";

describe("world assets local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, searches, updates, reorders, relates, and deletes local assets", async () => {
    const worlds = createInMemoryWorlds();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆"],
      mode: "local",
      maturity: 12,
    });
    app = await createAssetsApp(worlds);

    const setting = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/assets`)
      .send({
        kind: "setting",
        title: "记忆交易法",
        category: "世界规则",
        summary: "所有记忆交易需要登记许可。",
        body: "黑市交易会触发城市信用审查。",
        position: 2,
      })
      .expect(201);
    expect(setting.body.asset).toMatchObject({ worldId: world.id, kind: "setting", title: "记忆交易法" });

    const seed = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/assets`)
      .send({
        kind: "seed",
        title: "继承的童年",
        summary: "主角买到一段陌生童年。",
        body: "童年的原主仍然活着。",
        payload: {
          trigger: "一次非法交易",
          protagonists: "记忆修复师",
          questions: ["原主为何出售记忆？"],
        },
        position: 1,
      })
      .expect(201);
    expect(seed.body.asset).toMatchObject({ kind: "seed", title: "继承的童年" });

    const search = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/assets`)
      .query({ q: "登记许可" })
      .expect(200);
    expect(search.body.assets.map((asset: { id: string }) => asset.id)).toEqual([setting.body.asset.id]);

    const seeds = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/assets`)
      .query({ kind: "seed" })
      .expect(200);
    expect(seeds.body.assets).toHaveLength(1);
    expect(seeds.body.assets[0]).toMatchObject({ id: seed.body.asset.id, kind: "seed" });

    const updated = await request(app.getHttpServer())
      .patch(`/v1/worlds/${world.id}/assets/${setting.body.asset.id}`)
      .send({
        title: "记忆交易登记法",
        payload: { relations: ["城市信用"] },
      })
      .expect(200);
    expect(updated.body.asset).toMatchObject({
      id: setting.body.asset.id,
      title: "记忆交易登记法",
      payload: { relations: ["城市信用"] },
    });

    const relation = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/assets/${setting.body.asset.id}/relations`)
      .send({ targetAssetId: seed.body.asset.id })
      .expect(201);
    expect(relation.body.relation).toMatchObject({
      worldId: world.id,
      sourceAssetId: setting.body.asset.id,
      targetAssetId: seed.body.asset.id,
    });

    const detail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/assets/${setting.body.asset.id}`)
      .expect(200);
    expect(detail.body.asset.payload.relationTargets).toEqual([
      { targetAssetId: seed.body.asset.id, label: "继承的童年" },
    ]);

    const reordered = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/assets/reorder`)
      .send({ assetIds: [seed.body.asset.id, setting.body.asset.id] })
      .expect(200);
    expect(reordered.body.assets.map((asset: { id: string }) => asset.id)).toEqual([
      seed.body.asset.id,
      setting.body.asset.id,
    ]);

    await request(app.getHttpServer())
      .delete(`/v1/worlds/${world.id}/assets/${setting.body.asset.id}/relations/${seed.body.asset.id}`)
      .expect(200);
    const unrelateDetail = await request(app.getHttpServer())
      .get(`/v1/worlds/${world.id}/assets/${setting.body.asset.id}`)
      .expect(200);
    expect(unrelateDetail.body.asset.payload.relationTargets).toBeUndefined();

    const deleted = await request(app.getHttpServer())
      .delete(`/v1/worlds/${world.id}/assets/${seed.body.asset.id}`)
      .expect(200);
    expect(deleted.body.asset).toMatchObject({ id: seed.body.asset.id, kind: "seed" });
    await request(app.getHttpServer()).get(`/v1/worlds/${world.id}/assets/${seed.body.asset.id}`).expect(404);
  });
});

async function createAssetsApp(worlds: InMemoryWorlds) {
  return createHttpTestApp({
    controllers: [WorldAssetsController],
    providers: [
      { provide: WORLD_REPOSITORY, useValue: worlds },
      { provide: WorldAssetsService, useValue: createInMemoryWorldAssets(worlds) },
    ],
  });
}
