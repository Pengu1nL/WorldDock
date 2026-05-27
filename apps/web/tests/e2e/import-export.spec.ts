import { expect, test, type Page } from "playwright/test";
import { gotoApp } from "./helpers";

test("creator exports, imports, requests account export, and confirms deletion warning", async ({ page }) => {
  const importedPackages: any[] = [];
  let accountDeletionRequested = false;
  await setupImportExportApi(page, importedPackages, () => {
    accountDeletionRequested = true;
  });

  await gotoApp(page);
  await page.getByText("Export World").click();
  await page.getByLabel("设置").click();
  await page.getByRole("button", { name: "导入导出" }).click();

  await page.getByRole("button", { name: "导出世界包" }).click();
  await expect(page.getByLabel("世界包 JSON")).toHaveValue(/worlddock\.world-package\.v1/);

  await page.getByRole("button", { name: "导入世界包" }).click();
  await expect.poll(() => importedPackages.length).toBe(1);
  expect(importedPackages[0].world.name).toBe("Export World");

  await page.getByRole("button", { name: "导出账户数据" }).click();
  await expect(page.getByLabel("账户数据导出 JSON")).toHaveValue(/worlddock\.account-export\.v1/);

  await page.getByLabel("我已完成数据导出并理解删除会排期处理").check();
  await page.getByRole("button", { name: "删除账户" }).click();
  await expect.poll(() => accountDeletionRequested).toBe(true);
});

async function setupImportExportApi(page: Page, importedPackages: any[], onDeleteAccount: () => void) {
  await page.addInitScript(() => {
    window.localStorage.setItem("worlddock.sessionToken", "session_import_export");
  });

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
    mode: "cloud",
  };
  const worldPackage = {
    format: "worlddock.world-package.v1",
    exportedAt: "2026-05-27T00:00:00.000Z",
    world: {
      name: "Export World",
      type: "奇幻",
      summary: "可以导入导出的世界。",
      tags: ["export"],
      maturity: 66,
    },
    assets: [
      { kind: "setting", title: "规则", summary: "摘要", body: "正文", payload: { category: "设定" } },
    ],
    releases: [],
  };

  await page.route("**/v1/worlds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ worlds: [world] }) });
  });
  await page.route("**/v1/worlds/world_export/archive", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ archiveEntries: [] }) });
  });
  await page.route("**/v1/worlds/world_export/seeds", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ storySeeds: [] }) });
  });
  await page.route("**/v1/worlds/world_export/conflicts", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ conflicts: [] }) });
  });
  await page.route("**/v1/billing/usage", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        usage: {
          balance: { userId: "user_1", currency: "CNY", balanceCents: 10000, lowBalanceThresholdCents: 1000, updatedAt: "2026-05-27T00:00:00.000Z" },
          lastAgentRun: null,
          entries: [],
          placeholderIntents: [],
        },
      }),
    });
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
  await page.route("**/v1/account/data-export", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ export: { id: "account_export_1", kind: "account", status: "ready", createdAt: "2026-05-27T00:00:00.000Z" } }) });
  });
  await page.route("**/v1/account/data-export/account_export_1", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        export: { id: "account_export_1", kind: "account", status: "ready", createdAt: "2026-05-27T00:00:00.000Z" },
        data: { format: "worlddock.account-export.v1", worlds: [worldPackage] },
      }),
    });
  });
  await page.route("**/v1/account", async (route) => {
    onDeleteAccount();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ profile: { deletedAt: "2026-05-27T00:00:00.000Z" } }) });
  });
}
