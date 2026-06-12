import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import { WorldsController } from "../src/modules/worlds/worlds.controller";
import { createHttpTestApp, createInMemoryWorlds, type InMemoryWorlds } from "./local-api-test-helpers";

describe("worlds local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates, lists, updates, reads content, and deletes local worlds", async () => {
    const worlds = createInMemoryWorlds();
    app = await createWorldsApp(worlds);

    const created = await request(app.getHttpServer())
      .post("/v1/worlds")
      .send({
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: ["记忆", "城市"],
        maturity: 18,
      })
      .expect(201);

    const worldId = created.body.world.id;
    expect(created.body.world).toMatchObject({
      name: "回忆所",
      type: "近未来",
      mode: "local",
      archive: 0,
      seeds: 0,
      conflicts: 0,
    });

    const list = await request(app.getHttpServer()).get("/v1/worlds").expect(200);
    expect(list.body.worlds.map((world: { id: string }) => world.id)).toEqual([worldId]);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/worlds/${worldId}`)
      .send({ summary: "记忆交易被严格许可。", status: "unpublished", visibility: "public" })
      .expect(200);
    expect(updated.body.world).toMatchObject({
      id: worldId,
      summary: "记忆交易被严格许可。",
      status: "unpublished",
      visibility: "public",
    });

    const archive = await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/archive`)
      .send({
        title: "记忆交易法",
        category: "世界规则",
        summary: "所有交易需要登记。",
        body: "未经许可的交易会被追踪。",
        relations: ["城市信用"],
      })
      .expect(201);
    expect(archive.body.archiveEntry).toMatchObject({ worldId, title: "记忆交易法" });

    const seed = await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/seeds`)
      .send({
        title: "继承的童年",
        hook: "主角继承了一段陌生童年。",
        conflict: "这段记忆会改写他对家人的判断。",
        questions: ["记忆原主是谁？"],
      })
      .expect(201);
    expect(seed.body.storySeed).toMatchObject({ worldId, title: "继承的童年" });

    const conflict = await request(app.getHttpServer())
      .post(`/v1/worlds/${worldId}/conflicts`)
      .send({
        title: "许可与黑市",
        summary: "合法许可和地下交易互相挤压。",
        body: "黑市让弱者获得机会，也让记忆被掠夺。",
        related: [archive.body.archiveEntry.id],
        derivedSeeds: [seed.body.storySeed.id],
      })
      .expect(201);
    expect(conflict.body.conflict).toMatchObject({ worldId, title: "许可与黑市" });

    const detail = await request(app.getHttpServer()).get(`/v1/worlds/${worldId}`).expect(200);
    expect(detail.body.world).toMatchObject({ id: worldId, archive: 1, seeds: 1, conflicts: 1 });

    await request(app.getHttpServer()).get(`/v1/worlds/${worldId}/archive`).expect(200);
    await request(app.getHttpServer()).get(`/v1/worlds/${worldId}/seeds`).expect(200);
    await request(app.getHttpServer()).get(`/v1/worlds/${worldId}/conflicts`).expect(200);

    const deleted = await request(app.getHttpServer()).delete(`/v1/worlds/${worldId}`).expect(200);
    expect(deleted.body.world).toMatchObject({ id: worldId, status: "unpublished" });
    await request(app.getHttpServer()).get(`/v1/worlds/${worldId}`).expect(404);
  });

  it("duplicates a local world with its local assets", async () => {
    const worlds = createInMemoryWorlds();
    const original = await worlds.createWorld({
      name: "白塔城",
      type: "奇幻城市",
      summary: "一座由钟声管理时间的城市。",
      tags: ["钟声"],
      mode: "local",
      maturity: 42,
    });
    const archive = await worlds.createArchiveEntry({
      worldId: original.id,
      title: "报时塔",
      category: "地点",
      summary: "城市的所有时间从这里发出。",
      body: "塔内有无法停止的钟。",
      relations: [],
      position: 0,
    });
    const seed = await worlds.createStorySeed({
      worldId: original.id,
      title: "迟到者",
      hook: "一个人比城市慢了一分钟。",
      conflict: "他看见了所有人错过的真相。",
      questions: [],
      position: 1,
    });
    await worlds.createConflict({
      worldId: original.id,
      title: "公共时间与私人记忆",
      summary: "城市要求每个人服从同一时间。",
      body: "迟到者保留了自己的节奏。",
      related: [archive.id],
      derivedSeeds: [seed.id],
      position: 2,
    });

    app = await createWorldsApp(worlds);

    const duplicated = await request(app.getHttpServer())
      .post(`/v1/worlds/${original.id}/duplicate`)
      .expect(201);

    const copyId = duplicated.body.world.id;
    expect(duplicated.body.world).toMatchObject({
      name: "白塔城 · 副本",
      type: "奇幻城市",
      archive: 1,
      seeds: 1,
      conflicts: 1,
    });
    expect(copyId).not.toBe(original.id);

    const copyArchive = await request(app.getHttpServer()).get(`/v1/worlds/${copyId}/archive`).expect(200);
    const copySeeds = await request(app.getHttpServer()).get(`/v1/worlds/${copyId}/seeds`).expect(200);
    const copyConflicts = await request(app.getHttpServer()).get(`/v1/worlds/${copyId}/conflicts`).expect(200);
    expect(copyArchive.body.archiveEntries).toHaveLength(1);
    expect(copySeeds.body.storySeeds).toHaveLength(1);
    expect(copyConflicts.body.conflicts).toHaveLength(1);
  });
});

async function createWorldsApp(worlds: InMemoryWorlds) {
  return createHttpTestApp({
    controllers: [WorldsController],
    providers: [{ provide: WORLD_REPOSITORY, useValue: worlds }],
  });
}
