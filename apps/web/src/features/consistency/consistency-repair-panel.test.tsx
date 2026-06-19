// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsistencyIssue, WorldAssetPatchBatch } from "../worlddock/api";

import { ConsistencyRepairPanel } from "./consistency-repair-panel";

describe("ConsistencyRepairPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows repair controls, patch batch status, and batch revert action", () => {
    const onCreateRepairSession = vi.fn();
    const onRevertBatch = vi.fn();

    render(
      <ConsistencyRepairPanel
        issue={buildIssue()}
        batches={[buildBatch()]}
        onCreateRepairSession={onCreateRepairSession}
        onRevertBatch={onRevertBatch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "启动修复" }));
    fireEvent.click(screen.getByRole("button", { name: "撤销 batch_1" }));

    expect(screen.getByText("登记口径冲突")).toBeInTheDocument();
    expect(screen.getByText("已应用")).toBeInTheDocument();
    expect(onCreateRepairSession).toHaveBeenCalledWith("issue_1");
    expect(onRevertBatch).toHaveBeenCalledWith("batch_1");
  });

  it.each(["resolved", "ignored"] as const)("disables repair creation for %s issues", (status) => {
    const onCreateRepairSession = vi.fn();

    render(
      <ConsistencyRepairPanel
        issue={buildIssue({
          status,
          resolvedAt: status === "resolved" ? "2026-06-19T01:00:00.000Z" : null,
        })}
        onCreateRepairSession={onCreateRepairSession}
      />,
    );

    const repairButton = screen.getByRole("button", { name: "启动修复" });

    expect(repairButton).toBeDisabled();
    fireEvent.click(repairButton);
    expect(onCreateRepairSession).not.toHaveBeenCalled();
  });

  it("keeps reverted and reverting batches from being reverted again", () => {
    const onRevertBatch = vi.fn();

    render(
      <ConsistencyRepairPanel
        issue={buildIssue()}
        batches={[
          buildBatch({ id: "batch_reverted", status: "reverted", revertedAt: "2026-06-19T02:00:00.000Z" }),
          buildBatch({ id: "batch_reverting" }),
        ]}
        onRevertBatch={onRevertBatch}
        revertingBatchId="batch_reverting"
      />,
    );

    const revertedButton = screen.getByRole("button", { name: "撤销 batch_reverted" });
    const revertingButton = screen.getByRole("button", { name: "撤销 batch_reverting" });

    expect(screen.getByText("已撤销")).toBeInTheDocument();
    expect(screen.getByText("撤销中")).toBeInTheDocument();
    expect(revertedButton).toBeDisabled();
    expect(revertingButton).toBeDisabled();

    fireEvent.click(revertedButton);
    fireEvent.click(revertingButton);
    expect(onRevertBatch).not.toHaveBeenCalled();
  });
});

function buildIssue(overrides: Partial<ConsistencyIssue> = {}): ConsistencyIssue {
  return {
    id: "issue_1",
    worldId: "world_1",
    title: "登记口径冲突",
    description: "必须登记与无需登记冲突。",
    severity: "normal",
    status: "open",
    subjectAssetIds: ["asset_1"],
    evidence: [],
    metadata: {},
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function buildBatch(overrides: Partial<WorldAssetPatchBatch> = {}): WorldAssetPatchBatch {
  return {
    id: "batch_1",
    worldId: "world_1",
    sessionId: "session_1",
    issueId: "issue_1",
    status: "applied",
    patchIds: ["patch_1"],
    metadata: {},
    createdAt: "2026-06-19T00:00:00.000Z",
    appliedAt: "2026-06-19T00:01:00.000Z",
    revertedAt: null,
    ...overrides,
  };
}
