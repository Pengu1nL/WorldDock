import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { ExportsController } from "../src/modules/exports/exports.controller";
import { ExportsService } from "../src/modules/exports/exports.service";
import { WORLD_REPOSITORY } from "../src/modules/worlds/world.repository";
import { createHttpTestApp, createInMemoryWorlds, type InMemoryWorlds } from "./local-api-test-helpers";

describe("exports local endpoints", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("exports a local world package, reads it back, and imports it as a new local world", async () => {
    const worlds = createInMemoryWorlds();
    const world = await worlds.createWorld({
      name: "回忆所",
      type: "近未来",
      summary: "记忆可以被买卖。",
      tags: ["记忆", "城市"],
      mode: "local",
      maturity: 27,
    });
    await worlds.createArchiveEntry({
      worldId: world.id,
      title: "记忆交易法",
      category: "世界规则",
      summary: "所有交易都需要登记。",
      body: "未登记交易会触发城市信用审查。",
      relations: ["城市信用"],
      position: 0,
    });
    await worlds.createStorySeed({
      worldId: world.id,
      title: "继承的童年",
      hook: "主角买到一段陌生童年。",
      trigger: "一次非法交易",
      conflict: "这段记忆会改写他对家人的判断。",
      protagonists: "记忆修复师",
      questions: ["原主为何出售记忆？"],
      position: 1,
    });
    await worlds.createConflict({
      worldId: world.id,
      title: "许可与黑市",
      summary: "合法许可和地下交易互相挤压。",
      body: "黑市让弱者获得机会，也让记忆被掠夺。",
      related: ["记忆交易法"],
      derivedSeeds: ["继承的童年"],
      position: 2,
    });
    app = await createExportsApp(worlds);

    const exported = await request(app.getHttpServer())
      .post(`/v1/worlds/${world.id}/export`)
      .expect(201);
    expect(exported.body.export).toMatchObject({ kind: "world", status: "ready" });

    const fetched = await request(app.getHttpServer())
      .get(`/v1/exports/${exported.body.export.id}`)
      .expect(200);
    expect(fetched.body.package).toMatchObject({
      format: "worlddock.world-package.v1",
      world: {
        name: "回忆所",
        type: "近未来",
        summary: "记忆可以被买卖。",
        tags: ["记忆", "城市"],
        maturity: 27,
      },
    });
    expect(fetched.body.package.assets.map((asset: { kind: string }) => asset.kind).sort()).toEqual([
      "conflict",
      "seed",
      "setting",
    ]);

    const imported = await request(app.getHttpServer())
      .post("/v1/worlds/import")
      .send({ package: fetched.body.package })
      .expect(201);
    expect(imported.body.world).toMatchObject({
      name: "回忆所",
      type: "近未来",
      mode: "local",
      archive: 1,
      seeds: 1,
      conflicts: 1,
    });
    expect(imported.body.world.id).not.toBe(world.id);
  });
});

async function createExportsApp(worlds: InMemoryWorlds) {
  return createHttpTestApp({
    controllers: [ExportsController],
    providers: [
      ExportsService,
      { provide: WORLD_REPOSITORY, useValue: worlds },
    ],
  });
}
