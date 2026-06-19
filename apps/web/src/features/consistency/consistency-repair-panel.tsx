"use client";

import type { WorldAssetPatchBatch } from "@worlddock/contract";

import type { ConsistencyIssue } from "./use-consistency";
import { Icon } from "../worlddock/components";

export type ConsistencyRepairPanelProps = {
  issue?: ConsistencyIssue | null;
  batches?: WorldAssetPatchBatch[];
  creatingRepairSession?: boolean;
  revertingBatchId?: string | null;
  repairDisabled?: boolean;
  revertDisabled?: boolean;
  onCreateRepairSession?: (issueId: string) => void | Promise<void>;
  onRevertBatch?: (batchId: string) => void | Promise<void>;
};

export function ConsistencyRepairPanel({
  issue,
  batches = [],
  creatingRepairSession = false,
  revertingBatchId = null,
  repairDisabled = false,
  revertDisabled = false,
  onCreateRepairSession,
  onRevertBatch,
}: ConsistencyRepairPanelProps) {
  const subjectAssetIds = Array.isArray(issue?.subjectAssetIds) ? issue.subjectAssetIds : [];
  const canCreateRepairForIssue = issue?.status === "open" || issue?.status === "repairing";
  const canStartRepair = Boolean(
    issue
      && canCreateRepairForIssue
      && onCreateRepairSession
      && !creatingRepairSession
      && !repairDisabled,
  );

  return (
    <div className="col gap-3">
      <section className="card" style={{ padding: 14 }}>
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
          <Icon name="consistency" size={13} style={{ color: "var(--fg-2)" }} />
          <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
            修复对象
          </span>
          {issue ? (
            <span className="badge slate" style={{ marginLeft: "auto" }}>
              {getIssueStatusLabel(issue.status)}
            </span>
          ) : null}
        </div>

        {issue ? (
          <div className="col gap-3">
            <div>
              <div style={{ color: "var(--fg)", fontSize: "var(--t-14)", fontWeight: 650, lineHeight: 1.45 }}>
                {issue.title}
              </div>
              {issue.description ? (
                <p style={{ margin: "6px 0 0", color: "var(--fg-2)", fontSize: "var(--t-12)", lineHeight: 1.55 }}>
                  {issue.description}
                </p>
              ) : null}
            </div>

            {subjectAssetIds.length > 0 ? (
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                {subjectAssetIds.map((assetId) => (
                  <span className="tag" key={assetId}>{assetId}</span>
                ))}
              </div>
            ) : (
              <div className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
                暂无资产关联
              </div>
            )}

            <button
              className="btn"
              disabled={!canStartRepair}
              onClick={() => canStartRepair ? onCreateRepairSession?.(issue.id) : undefined}
              type="button"
            >
              <Icon name="session" size={12} />
              <span>{creatingRepairSession ? "创建中" : "启动修复"}</span>
            </button>
          </div>
        ) : (
          <div className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
            选择一个矛盾后开始修复。
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 14 }}>
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
          <Icon name="assets" size={13} style={{ color: "var(--fg-2)" }} />
          <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
            Patch batches
          </span>
          <span className="mono" style={{ marginLeft: "auto", color: "var(--fg-3)", fontSize: 11 }}>
            {batches.length}
          </span>
        </div>

        {batches.length === 0 ? (
          <div className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
            暂无已应用的修复 batch。
          </div>
        ) : (
          <div className="col gap-2">
            {batches.map((batch) => {
              const isReverting = revertingBatchId === batch.id;
              const canRevert = batch.status === "applied" && !isReverting && !revertDisabled && Boolean(onRevertBatch);

              return (
                <div
                  key={batch.id}
                  style={{
                    padding: 12,
                    border: "1px solid var(--hairline)",
                    borderRadius: 6,
                    background: "var(--surface-1)",
                  }}
                >
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <span className="mono" style={{ color: "var(--fg)", fontSize: 12 }}>
                      {batch.id}
                    </span>
                    <span className={batch.status === "applied" ? "badge sage" : "badge slate"}>
                      {getBatchStatusLabel(batch.status)}
                    </span>
                  </div>
                  <div
                    className="row gap-2"
                    style={{ alignItems: "center", marginTop: 10, color: "var(--fg-3)", fontSize: "var(--t-12)" }}
                  >
                    <span>{batch.patchIds?.length ?? 0} 个 patch</span>
                    <div className="flex" />
                    <button
                      aria-label={`撤销 ${batch.id}`}
                      className="btn ghost sm"
                      disabled={!canRevert}
                      onClick={() => onRevertBatch?.(batch.id)}
                      type="button"
                    >
                      <Icon name="refresh" size={12} />
                      <span>{isReverting ? "撤销中" : "撤销"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function getIssueStatusLabel(status?: ConsistencyIssue["status"]) {
  const labels: Record<ConsistencyIssue["status"], string> = {
    open: "待处理",
    repairing: "修复中",
    resolved: "已解决",
    ignored: "已忽略",
  };

  return status ? labels[status] ?? status : "未选择";
}

function getBatchStatusLabel(status: WorldAssetPatchBatch["status"]) {
  const labels: Record<WorldAssetPatchBatch["status"], string> = {
    applied: "已应用",
    reverted: "已撤销",
  };

  return labels[status] ?? status;
}
