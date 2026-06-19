"use client";

import type { ConsistencyIssue } from "./use-consistency";
import { Icon } from "../worlddock/components";

type ConsistencyIssueEvidenceView = ConsistencyIssue["evidence"][number];

export type ConsistencyIssueDetailProps = {
  issue?: ConsistencyIssue | null;
  loading?: boolean;
  actionPending?: boolean;
  onIgnoreIssue?: (issueId: string) => void;
  onCreateRepairSession?: (issue: ConsistencyIssue) => void;
  onReopenIssue?: (issueId: string) => void;
};

export function ConsistencyIssueDetail({
  issue,
  loading = false,
  actionPending = false,
  onIgnoreIssue,
  onCreateRepairSession,
  onReopenIssue,
}: ConsistencyIssueDetailProps) {
  if (loading && !issue) {
    return (
      <aside className="card" style={{ padding: 16, minHeight: 260 }}>
        <div className="row gap-2" style={{ color: "var(--fg-3)", fontSize: "var(--t-12)" }}>
          <span className="dot amber pulse" />
          <span className="mono">正在载入问题详情</span>
        </div>
      </aside>
    );
  }

  if (!issue) {
    return (
      <aside className="card" style={{ padding: 16, minHeight: 260 }}>
        <div className="row gap-2" style={{ alignItems: "center", color: "var(--fg-3)" }}>
          <Icon name="consistency" size={14} />
          <span style={{ fontSize: "var(--t-13)" }}>选择一个问题查看详情</span>
        </div>
      </aside>
    );
  }

  const evidence = getEvidence(issue);
  const subjectAssetIds = getSubjectAssetIds(issue);
  const canReopen = issue.status === "ignored" || issue.status === "resolved";
  const canCreateRepairSession = issue.status === "open" || issue.status === "repairing";

  return (
    <aside className="card" style={{ padding: 0, minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
          <span className={getSeverityBadgeClass(issue.severity)}>{getSeverityLabel(issue.severity)}</span>
          <span className="badge slate">{getStatusLabel(issue.status)}</span>
        </div>
        <h2 style={{ fontSize: "var(--t-18)", lineHeight: 1.35, letterSpacing: 0, margin: 0 }}>
          {issue.title}
        </h2>
      </div>

      <div className="col gap-3" style={{ padding: 16 }}>
        <section>
          <h3 style={sectionTitleStyle}>描述</h3>
          <p style={{ margin: 0, color: "var(--fg-1)", fontSize: "var(--t-13)", lineHeight: 1.7 }}>
            {issue.description}
          </p>
        </section>

        <section>
          <h3 style={sectionTitleStyle}>证据</h3>
          {evidence.length === 0 ? (
            <div className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
              暂无证据片段
            </div>
          ) : (
            <div className="col gap-2">
              {evidence.map((entry, index) => (
                <div
                  key={`${entry.assetId ?? "evidence"}-${index}`}
                  style={{
                    padding: 12,
                    background: "var(--surface-1)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 6,
                  }}
                >
                  <div className="row gap-2" style={{ alignItems: "center", marginBottom: 6 }}>
                    <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
                      {entry.assetId ?? entry.messageId ?? `证据 ${index + 1}`}
                    </span>
                    {typeof entry.confidence === "number" ? (
                      <span className="mono" style={{ marginLeft: "auto", color: "var(--fg-3)", fontSize: 11 }}>
                        {Math.round(entry.confidence * 100)}%
                      </span>
                    ) : null}
                  </div>
                  <blockquote style={{
                    margin: 0,
                    color: "var(--fg-1)",
                    fontSize: "var(--t-12)",
                    lineHeight: 1.65,
                  }}>
                    {entry.quote}
                  </blockquote>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 style={sectionTitleStyle}>涉及资产</h3>
          {subjectAssetIds.length === 0 ? (
            <div className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
              暂无资产关联
            </div>
          ) : (
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {subjectAssetIds.map((assetId) => (
                <span className="tag" key={assetId}>{assetId}</span>
              ))}
            </div>
          )}
        </section>

        <div className="row gap-2" style={{ paddingTop: 4, flexWrap: "wrap" }}>
          {canCreateRepairSession ? (
            <button
              className="btn sm"
              disabled={actionPending || !onCreateRepairSession}
              onClick={() => onCreateRepairSession?.(issue)}
              type="button"
            >
              <Icon name="session" size={12} />
              <span>启动修复</span>
            </button>
          ) : null}
          {canReopen ? (
            <button
              className="btn sm"
              disabled={actionPending || !onReopenIssue}
              onClick={() => onReopenIssue?.(issue.id)}
              type="button"
            >
              <Icon name="refresh" size={12} />
              <span>重开问题</span>
            </button>
          ) : (
            <button
              className="btn ghost sm"
              disabled={actionPending || !onIgnoreIssue}
              onClick={() => onIgnoreIssue?.(issue.id)}
              type="button"
            >
              <Icon name="eyeoff" size={12} />
              <span>忽略问题</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

const sectionTitleStyle = {
  color: "var(--fg-2)",
  fontSize: "var(--t-12)",
  fontWeight: 650,
  letterSpacing: 0,
  margin: "0 0 8px",
};

function getEvidence(issue: ConsistencyIssue): ConsistencyIssueEvidenceView[] {
  return Array.isArray(issue.evidence) ? issue.evidence : [];
}

function getSubjectAssetIds(issue: ConsistencyIssue) {
  return Array.isArray(issue.subjectAssetIds) ? issue.subjectAssetIds : [];
}

function getSeverityBadgeClass(severity: ConsistencyIssue["severity"]) {
  if (severity === "critical" || severity === "high") return "badge amber";
  if (severity === "low") return "badge slate";
  return "badge";
}

function getSeverityLabel(severity: ConsistencyIssue["severity"]) {
  const labels: Record<ConsistencyIssue["severity"], string> = {
    low: "低",
    normal: "普通",
    high: "高",
    critical: "严重",
  };

  return labels[severity] ?? severity;
}

function getStatusLabel(status: ConsistencyIssue["status"]) {
  const labels: Record<ConsistencyIssue["status"], string> = {
    open: "待处理",
    repairing: "修复中",
    resolved: "已解决",
    ignored: "已忽略",
  };

  return labels[status] ?? status;
}
