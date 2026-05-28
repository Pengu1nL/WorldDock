import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
  join(__dirname, "world-dock-app.tsx"),
  join(__dirname, "view-worlds.tsx"),
  join(__dirname, "view-community.tsx"),
  join(__dirname, "view-settings.tsx"),
];

const sessionBoundaryFiles = [
  join(__dirname, "world-dock-app.tsx"),
  join(__dirname, "view-community.tsx"),
  join(__dirname, "view-settings.tsx"),
  join(__dirname, "../onboarding/onboarding-flow.tsx"),
  join(__dirname, "../../app/(auth)/login/page.tsx"),
  join(__dirname, "../../app/(auth)/register/page.tsx"),
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

  it("keeps direct browser session token storage access inside the shared API helper", () => {
    const sessionTokenKey = "worlddock.sessionToken";

    for (const file of sessionBoundaryFiles) {
      const source = readFileSync(file, "utf8");

      expect(source).not.toContain(`localStorage.getItem("${sessionTokenKey}")`);
      expect(source).not.toContain(`localStorage.setItem("${sessionTokenKey}"`);
      expect(source).not.toContain(`localStorage.removeItem("${sessionTokenKey}")`);
      expect(source).not.toContain(`localStorage.getItem('${sessionTokenKey}')`);
      expect(source).not.toContain(`localStorage.setItem('${sessionTokenKey}'`);
      expect(source).not.toContain(`localStorage.removeItem('${sessionTokenKey}')`);
    }
  });
});
