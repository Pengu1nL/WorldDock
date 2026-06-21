// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldAsset } from "@worlddock/domain";
import { PublishView, scanAssetsForSecrets } from "./view-publish";

describe("PublishView", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows release readiness checklist with missing publish reasons", () => {
    const { container } = render(
      <PublishView
        currentWorld={{ id: "world_1", name: "潮汐之书" }}
        assets={[]}
        onToast={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const readiness = screen.getByLabelText("发布准备");
    const pageBody = container.querySelector(".page-body");

    expect(within(readiness).getByText("发布准备")).toBeInTheDocument();
    expect(within(readiness).getByRole("list")).toBeInTheDocument();
    expect(within(readiness).getByText("1/4")).toBeInTheDocument();
    expect(within(readiness).getAllByText("待完成")).toHaveLength(3);
    expect(within(readiness).getAllByText("已完成")).toHaveLength(1);
    expect(screen.getByText("填写 Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("填写 Owner，待完成")).toBeInTheDocument();
    expect(screen.getByText("填写 Slug")).toBeInTheDocument();
    expect(screen.getByLabelText("填写 Slug，待完成")).toBeInTheDocument();
    expect(screen.getByText("选择至少 1 项资产")).toBeInTheDocument();
    expect(screen.getByLabelText("选择至少 1 项资产，待完成")).toBeInTheDocument();
    expect(screen.getByLabelText("敏感内容预检通过，已完成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();
    expect(pageBody).not.toBeNull();
    expect(container.querySelector(".sticky-action-bar")?.closest(".page-body")).toBe(pageBody);
  });

  it("updates readiness from missing assets to ready for a safe selected asset", async () => {
    const safeAsset = makeAsset({ id: "asset_safe", title: "潮汐律", body: "潮汐律定义文明周期。" });
    const { rerender } = render(
      <PublishView
        currentWorld={{ id: "world_1", name: "潮汐之书" }}
        assets={[]}
        onToast={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    let readiness = screen.getByLabelText("发布准备");
    expect(within(readiness).getByRole("list")).toBeInTheDocument();
    expect(within(readiness).getByText("1/4")).toBeInTheDocument();
    expect(screen.getByLabelText("填写 Owner，待完成")).toBeInTheDocument();
    expect(screen.getByLabelText("填写 Slug，待完成")).toBeInTheDocument();
    expect(screen.getByLabelText("选择至少 1 项资产，待完成")).toBeInTheDocument();
    expect(screen.getByLabelText("敏感内容预检通过，已完成")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "ren" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "tide-book" } });

    readiness = screen.getByLabelText("发布准备");
    expect(within(readiness).getByText("3/4")).toBeInTheDocument();
    expect(within(readiness).getAllByText("已完成")).toHaveLength(3);
    expect(within(readiness).getAllByText("待完成")).toHaveLength(1);
    expect(screen.getByLabelText("填写 Owner，已完成")).toBeInTheDocument();
    expect(screen.getByLabelText("填写 Slug，已完成")).toBeInTheDocument();
    expect(screen.getByLabelText("选择至少 1 项资产，待完成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();

    rerender(
      <PublishView
        currentWorld={{ id: "world_1", name: "潮汐之书" }}
        assets={[safeAsset]}
        onToast={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      const nextReadiness = screen.getByLabelText("发布准备");
      expect(within(nextReadiness).getByText("4/4")).toBeInTheDocument();
    });
    readiness = screen.getByLabelText("发布准备");
    expect(within(readiness).getAllByText("已完成")).toHaveLength(4);
    expect(within(readiness).queryByText("待完成")).not.toBeInTheDocument();
    expect(screen.getByLabelText("选择至少 1 项资产，已完成")).toBeInTheDocument();
    expect(screen.getByLabelText("敏感内容预检通过，已完成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeEnabled();
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
    const readiness = screen.getByLabelText("发布准备");
    expect(within(readiness).getByRole("list")).toBeInTheDocument();
    expect(within(readiness).getByText("3/4")).toBeInTheDocument();
    expect(screen.getByLabelText("确认敏感内容预检，待完成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("确认允许发布疑似敏感内容"));
    expect(screen.getByLabelText("确认敏感内容预检，已完成")).toBeInTheDocument();
    expect(within(readiness).getByText("4/4")).toBeInTheDocument();
    expect(within(readiness).getAllByText("已完成")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "发布" })).toBeEnabled();
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
