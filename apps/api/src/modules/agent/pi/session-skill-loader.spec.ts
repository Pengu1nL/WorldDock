import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSessionPiSkills } from "./session-skill-loader";

describe("loadSessionPiSkills", () => {
  it("loads the world exploration skill for world exploration sessions", () => {
    expect(loadSessionPiSkills({ kind: "world_exploration" }).map((skill) => skill.name)).toEqual(["world-exploration"]);
  });

  it("reads default skill instructions without a configured skillsDir", () => {
    const [skill] = loadSessionPiSkills({ kind: "world_exploration" });

    expect(skill.instructions).toContain("围绕用户给出的世界、上下文和问题");
  });

  it("loads the asset deposition skill for world exploration deposition intent", () => {
    expect(
      loadSessionPiSkills({
        kind: "world_exploration",
        intent: "asset_deposition",
      }).map((skill) => skill.name),
    ).toEqual(["asset-deposition"]);
  });

  it("instructs asset deposition to create directly when the user already requested deposition", () => {
    const [skill] = loadSessionPiSkills({
      kind: "world_exploration",
      intent: "asset_deposition",
    });

    expect(skill.instructions).toContain("不要再次要求用户确认");
    expect(skill.instructions).not.toContain("供用户确认");
  });

  it("loads the asset edit skill for asset edit sessions", () => {
    expect(loadSessionPiSkills({ kind: "asset_edit" }).map((skill) => skill.name)).toEqual(["asset-edit"]);
  });

  it("loads the consistency repair skill for consistency repair sessions", () => {
    expect(loadSessionPiSkills({ kind: "consistency_repair" }).map((skill) => skill.name)).toEqual(["consistency-repair"]);
  });

  it("reads skill instructions from a configured skillsDir", () => {
    const skillsDir = mkdtempSync(join(tmpdir(), "worlddock-pi-skills-"));
    const skillDir = join(skillsDir, "world-exploration");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "自定义技能正文：禁止调用写入工具。");

    try {
      const [skill] = loadSessionPiSkills({
        kind: "world_exploration",
        skillsDir,
      });

      expect(skill.path).toBe(`${skillsDir}/world-exploration`);
      expect(skill.instructions).toContain("禁止调用写入工具");
    } finally {
      rmSync(skillsDir, { recursive: true, force: true });
    }
  });
});
