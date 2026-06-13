// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldAsset } from "@worlddock/domain";
import { PublishView, scanAssetsForSecrets } from "./view-publish";

describe("PublishView", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires confirmation for redacted secret findings before pushing", async () => {
    const secret = "Bearer sk-live-secret-should-not-render";
    const pushApi = vi.fn(async () => ({
      repository: { owner: "ren", slug: "tide-book" },
      release: {
        id: "rel_1",
        version: "0.1.0",
        url: "https://hub.worlddock.test/ren/tide-book/releases/rel_1",
      },
    }));

    render(
      <PublishView
        currentWorld={{ id: "world_1", name: "潮汐之书" }}
        assets={[
          makeAsset({ id: "asset_safe", title: "潮汐律", body: "潮汐律定义文明周期。" }),
          makeAsset({ id: "asset_secret", title: "密钥残留", body: `临时调试头：${secret}` }),
        ]}
        onToast={() => undefined}
        onBack={() => undefined}
        pushApi={pushApi}
      />,
    );

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "ren" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "tide-book" } });
    fireEvent.click(screen.getByLabelText("选择资产 潮汐律"));

    expect(await screen.findByText("命中 1")).toBeInTheDocument();
    expect(screen.getByText("Bearer <redacted>")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(secret);
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("确认允许发布疑似敏感内容"));
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(pushApi).toHaveBeenCalledWith("world_1", {
      owner: "ren",
      slug: "tide-book",
      note: undefined,
      selectedAssetIds: ["asset_secret"],
      allowSecretFindings: true,
    }));
    expect(await screen.findByText("https://hub.worlddock.test/ren/tide-book/releases/rel_1")).toBeInTheDocument();
  });

  it("redacts supported local scan patterns", () => {
    const secretTitle = "OPENAI_API_KEY=sk-title-secret";
    const findings = scanAssetsForSecrets([
      makeAsset({
        id: "asset_1",
        title: secretTitle,
        summary: "来自 .env",
        body: "OPENAI_API_KEY=sk-real-value",
        payload: {
          note: "-----BEGIN PRIVATE KEY-----",
          "Bearer sk-key-name-secret": "key name should be redacted",
          nested: { bearer: "Bearer sk-another-real-value" },
        },
      }),
    ]);

    expect(findings.map((finding) => finding.excerpt)).toEqual([
      "OPENAI_API_KEY=<redacted>",
      ".env",
      "OPENAI_API_KEY=<redacted>",
      "-----BEGIN PRIVATE KEY-----<redacted>",
      "Bearer <redacted>",
      "Bearer <redacted>",
    ]);
    expect(findings.map((finding) => finding.excerpt).join("\n")).not.toContain("sk-real-value");
    expect(findings.map((finding) => finding.excerpt).join("\n")).not.toContain("sk-another-real-value");
    expect(findings.map((finding) => finding.excerpt).join("\n")).not.toContain("sk-title-secret");
    expect(findings.map((finding) => finding.excerpt).join("\n")).not.toContain("sk-key-name-secret");
    expect(findings.map((finding) => finding.path).join("\n")).not.toContain(secretTitle);
    expect(findings.map((finding) => finding.path).join("\n")).not.toContain("sk-key-name-secret");
  });
});

function makeAsset(overrides: Partial<WorldAsset>): WorldAsset {
  return {
    id: "asset",
    worldId: "world_1",
    kind: "setting",
    title: "资产",
    category: "世界规则",
    summary: "摘要",
    body: "正文",
    payload: {},
    position: 0,
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}
