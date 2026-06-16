import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
  join(__dirname, "world-dock-app.tsx"),
  join(__dirname, "shell/world-dock-shell.tsx"),
  join(__dirname, "shell/world-dock-runtime.tsx"),
  join(__dirname, "shell/world-workspace.tsx"),
  join(__dirname, "view-worlds.tsx"),
  join(__dirname, "view-settings.tsx"),
];

describe("WorldDock production runtime", () => {
  it("does not import mock fixtures or fall back to local demo data", () => {
    for (const file of runtimeFiles) {
      const source = readFileSync(file, "utf8");

      expect(source).not.toContain("./mock-data");
      expect(source).not.toContain("./fixtures");
      expect(source).not.toContain("wd_mock_token");
      expect(source).not.toContain("Mock Failure");
      expect(source).not.toContain("本地演示");
      expect(source).not.toContain("演示流");
    }
  });
});
