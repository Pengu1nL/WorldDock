import { describe, expect, it } from "vitest";
import { scanReleaseSnapshotForSecrets } from "./no-secret-scan";

describe("scanReleaseSnapshotForSecrets", () => {
  it("catches env filenames and API key traces without returning the full secret", () => {
    const findings = scanReleaseSnapshotForSecrets({
      contractVersion: "1.0.0",
      repository: {
        owner: "studio",
        slug: "memory-market",
        name: "Memory Market",
      },
      package: {
        format: "worlddock.world-package.v1",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "Memory Market",
          type: "city",
          summary: "Draft notes mention DATABASE_URL=postgres://user:pass@localhost/world near .env.local setup.",
          tags: ["urban"],
          maturity: 32,
        },
        assets: [
          {
            kind: "setting",
            title: "Operator Runbook",
            summary: "Deployment notes",
            body: "-----BEGIN PRIVATE KEY-----",
            payload: {},
          },
        ],
        releases: [],
      },
      assets: [
        {
          id: "archive_1",
          kind: "setting",
          title: "记忆交易法",
          summary: "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          body: "OPENAI_API_KEY=sk-test-secret should not be exported.",
          payload: {
            providerKey: "ANTHROPIC_API_KEY=anthropic-secret",
            filename: ".env",
            authorization: "Bearer sk-live-secret",
            github: "GITHUB_TOKEN=ghp_live_secret and ghp_another_secret",
          },
        },
      ],
      createdAt: "2026-06-12T00:00:00.000Z",
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "package.world.summary", reason: "env_file" }),
      expect.objectContaining({ path: "package.world.summary", reason: "token" }),
      expect.objectContaining({ path: "package.assets[0].body", reason: "private_key" }),
      expect.objectContaining({ path: "assets[0].summary", reason: "api_key" }),
      expect.objectContaining({ path: "assets[0].body", reason: "api_key" }),
      expect.objectContaining({ path: "assets[0].body", reason: "token" }),
      expect.objectContaining({ path: "assets[0].payload.providerKey", reason: "api_key" }),
      expect.objectContaining({ path: "assets[0].payload.filename", reason: "env_file" }),
      expect.objectContaining({ path: "assets[0].payload.authorization", reason: "token" }),
      expect.objectContaining({ path: "assets[0].payload.github", reason: "token" }),
    ]));
    expect(findings.every((finding) => /^<redacted:(api_key|env_file|private_key|token)>$/.test(finding.excerpt))).toBe(true);
    const excerpts = findings.map((finding) => finding.excerpt).join("\n");
    expect(excerpts).not.toContain("postgres://");
    expect(excerpts).not.toContain("wJalrXUtnFEMI");
    expect(excerpts).not.toContain("sk-test-secret");
    expect(excerpts).not.toContain("sk-live-secret");
    expect(excerpts).not.toContain("ghp_live_secret");
  });

  it("scans v2 official package assets and snapshot assets", () => {
    const findings = scanReleaseSnapshotForSecrets({
      contractVersion: "1.0.0",
      repository: {
        owner: "studio",
        slug: "memory-market",
        name: "Memory Market",
      },
      package: {
        format: "worlddock.world-package.v2",
        exportedAt: "2026-06-12T00:00:00.000Z",
        world: {
          name: "Memory Market",
          type: "city",
          summary: "A city built around traded memories.",
          tags: ["urban"],
          maturity: 32,
        },
        assets: [
          {
            type: "rule",
            name: "Operator Token Policy",
            summary: "No secrets in official assets.",
            markdown: "OPENAI_API_KEY=sk-package-secret\nGITHUB_TOKEN=ghp_snapshot_secret",
            tags: [],
            metadata: { runbook: ".env", auth: "Bearer sk-live-secret" },
          },
        ],
        releases: [],
      },
      assets: [
        {
          id: "official_asset_1",
          type: "rule",
          name: "Operator Token Policy",
          summary: "No secrets in official assets.",
          markdown: "OPENAI_API_KEY=sk-package-secret\nGITHUB_TOKEN=ghp_snapshot_secret",
          tags: [],
          metadata: { runbook: ".env", auth: "Bearer sk-live-secret" },
        },
      ],
      createdAt: "2026-06-12T00:00:00.000Z",
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "package.assets[0].markdown", reason: "api_key" }),
      expect.objectContaining({ path: "package.assets[0].markdown", reason: "token" }),
      expect.objectContaining({ path: "package.assets[0].metadata.runbook", reason: "env_file" }),
      expect.objectContaining({ path: "assets[0].markdown", reason: "token" }),
      expect.objectContaining({ path: "assets[0].metadata.auth", reason: "token" }),
    ]));
    const excerpts = findings.map((finding) => finding.excerpt).join("\n");
    expect(excerpts).not.toContain("sk-package-secret");
    expect(excerpts).not.toContain("ghp_snapshot_secret");
    expect(excerpts).not.toContain("sk-live-secret");
  });
});
