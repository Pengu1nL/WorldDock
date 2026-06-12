import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator exports and imports a local world package", async ({ page }) => {
  const importedPackages: any[] = [];
  await setupImportExportApi(page, importedPackages);

  await gotoApp(page, { installMocks: false });
  await page.getByText("Export World").click();
  await page.getByLabel("设置").click();
  await page.getByRole("button", { name: "导入导出" }).click();

  await page.getByRole("button", { name: "导出世界包" }).click();
  await expect(page.getByLabel("世界包 JSON")).toHaveValue(/worlddock\.world-package\.v1/);

  await page.getByRole("button", { name: "导入世界包" }).click();
  await expect.poll(() => importedPackages.length).toBe(1);
  expect(importedPackages[0].world.name).toBe("Export World");
});

async function setupImportExportApi(page: Page, importedPackages: any[]) {
  const world = {
    id: "world_export",
    name: "Export World",
    type: "奇幻",
    summary: "可以导入导出的世界。",
    tags: ["export"],
    maturity: 66,
    status: "draft",
    visibility: "private",
    archive: 1,
    seeds: 1,
    conflicts: 1,
    updated: "2026-05-27T00:00:00.000Z",
    mode: "local",
  };
  const worldPackage = {
    schemaVersion: "worlddock.world-package.v1",
    exportedAt: "2026-05-27T00:00:00.000Z",
    world: {
      name: "Export World",
      type: "奇幻",
      summary: "可以导入导出的世界。",
      tags: ["export"],
      maturity: 66,
    },
    archiveEntries: [
      { id: "archive_1", title: "规则", summary: "摘要", body: "正文", payload: { category: "设定" } },
    ],
    storySeeds: [],
    conflicts: [],
  };

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [world] }) });
  });
  await page.route("**/v1/worlds/world_export/assets", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ assets: [], nextCursor: null }) });
  });
  await page.route("**/v1/worlds/world_export/export", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ export: { id: "export_1", kind: "world", status: "ready", createdAt: "2026-05-27T00:00:00.000Z" } }) });
  });
  await page.route("**/v1/exports/export_1", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ export: { id: "export_1", kind: "world", status: "ready", createdAt: "2026-05-27T00:00:00.000Z" }, package: worldPackage }) });
  });
  await page.route("**/v1/worlds/import", async (route) => {
    importedPackages.push(route.request().postDataJSON().package);
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ world: { ...world, id: "world_imported", name: "Export World" } }) });
  });
}
