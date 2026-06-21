"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../worlddock/components";
import {
  useConsistencyIssueDetail,
  useConsistencyIssues,
  useIgnoreIssue,
  useReopenIssue,
  useRunConsistencyCheck,
  type ConsistencyIssue,
} from "./use-consistency";
import { ConsistencyIssueDetail } from "./consistency-issue-detail";

type WorldLike = {
  id: string;
  name?: string;
};

type ConsistencyIssueStatusFilter = ConsistencyIssue["status"];

type ConsistencyIssuesPageProps = {
  world: WorldLike;
  issues?: ConsistencyIssue[];
  loading?: boolean;
  loadingMore?: boolean;
  runningCheck?: boolean;
  error?: unknown;
  detailIssue?: ConsistencyIssue | null;
  detailLoading?: boolean;
  actionPending?: boolean;
  actionError?: string | null;
  actionNotice?: string | null;
  nextCursor?: string | null;
  onClearActionError?: () => void;
  onCreateRepairSession?: (issue: ConsistencyIssue) => void | Promise<void>;
  onRunCheck?: () => void | Promise<void>;
  onOpenIssue?: (issueId: string) => void;
  onIgnoreIssue?: (issueId: string) => void | Promise<void>;
  onLoadMore?: () => void | Promise<void>;
  onReopenIssue?: (issueId: string) => void | Promise<void>;
};

const CONSISTENCY_ISSUES_PAGE_SIZE = 50;

const STATUS_FILTERS: Array<{ id: ConsistencyIssueStatusFilter; label: string }> = [
  { id: "open", label: "待处理" },
  { id: "repairing", label: "修复中" },
  { id: "resolved", label: "已解决" },
  { id: "ignored", label: "已忽略" },
];

export function ConsistencyIssuesPage(props: ConsistencyIssuesPageProps) {
  const [statusFilter, setStatusFilter] = useState<ConsistencyIssueStatusFilter>("open");
  const [search, setSearch] = useState("");

  if (props.issues !== undefined) {
    return (
      <ConsistencyIssuesContent
        {...props}
        search={search}
        statusFilter={statusFilter}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
      />
    );
  }

  return (
    <ConsistencyIssuesRemotePage
      {...props}
      search={search}
      statusFilter={statusFilter}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
    />
  );
}

type ConsistencyIssuesRemotePageProps = ConsistencyIssuesPageProps & {
  statusFilter: ConsistencyIssueStatusFilter;
  search: string;
  onStatusFilterChange: (status: ConsistencyIssueStatusFilter) => void;
  onSearchChange: (search: string) => void;
};

function ConsistencyIssuesRemotePage({
  world,
  statusFilter,
  search,
  actionPending: externalActionPending = false,
  onStatusFilterChange,
  onSearchChange,
  onCreateRepairSession,
  onOpenIssue,
}: ConsistencyIssuesRemotePageProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedIssues, setLoadedIssues] = useState<ConsistencyIssue[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [remoteActionError, setRemoteActionError] = useState<string | null>(null);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const issuesQuery = useConsistencyIssues(world.id, {
    status: statusFilter,
    cursor,
    limit: CONSISTENCY_ISSUES_PAGE_SIZE,
  });
  const detailQuery = useConsistencyIssueDetail(world.id, selectedIssueId);
  const runCheck = useRunConsistencyCheck(world.id);
  const ignoreIssue = useIgnoreIssue(world.id);
  const reopenIssue = useReopenIssue(world.id);

  useEffect(() => {
    setSelectedIssueId(null);
    setCursor(undefined);
    setLoadedIssues([]);
    setNextCursor(null);
  }, [statusFilter, world.id]);

  useEffect(() => {
    if (!issuesQuery.data) return;
    setLoadedIssues((current) => cursor
      ? mergeConsistencyIssues(current, issuesQuery.data.issues)
      : issuesQuery.data.issues);
    setNextCursor(issuesQuery.data.nextCursor);
    setRemoteActionError(null);
  }, [cursor, issuesQuery.data]);

  useEffect(() => {
    if (issuesQuery.error && cursor && loadedIssues.length > 0) {
      setRemoteActionError(getErrorMessage(issuesQuery.error));
    }
  }, [cursor, issuesQuery.error, loadedIssues.length]);

  return (
    <ConsistencyIssuesContent
      actionPending={externalActionPending || ignoreIssue.isPending || reopenIssue.isPending}
      actionError={remoteActionError}
      actionNotice={checkNotice}
      detailIssue={detailQuery.data ?? null}
      detailLoading={detailQuery.isLoading}
      error={loadedIssues.length === 0 ? issuesQuery.error : undefined}
      issues={loadedIssues}
      loading={issuesQuery.isLoading && loadedIssues.length === 0}
      loadingMore={Boolean(cursor && issuesQuery.isFetching)}
      nextCursor={nextCursor}
      onIgnoreIssue={async (issueId) => {
        setCheckNotice(null);
        await ignoreIssue.mutateAsync(issueId);
        setLoadedIssues((current) => current.filter((issue) => issue.id !== issueId));
        if (selectedIssueId === issueId) setSelectedIssueId(null);
      }}
      onClearActionError={() => setRemoteActionError(null)}
      onCreateRepairSession={onCreateRepairSession}
      onLoadMore={nextCursor ? async () => {
        if (cursor === nextCursor && issuesQuery.isError) {
          const result = await issuesQuery.refetch();
          if (result.error) throw result.error;
          return;
        }
        setCursor(nextCursor);
      } : undefined}
      onOpenIssue={(issueId) => {
        setSelectedIssueId(issueId);
        onOpenIssue?.(issueId);
      }}
      onReopenIssue={async (issueId) => {
        setCheckNotice(null);
        await reopenIssue.mutateAsync(issueId);
        setLoadedIssues((current) => current.filter((issue) => issue.id !== issueId));
        if (selectedIssueId === issueId) setSelectedIssueId(null);
      }}
      onRunCheck={async () => {
        setCheckNotice(null);
        const result = await runCheck.mutateAsync();
        setSelectedIssueId(null);
        setCursor(undefined);
        setLoadedIssues([]);
        setNextCursor(null);
        setCheckNotice(getRunCheckNotice(result.issues.length));
      }}
      onSearchChange={onSearchChange}
      onStatusFilterChange={(status) => {
        setCheckNotice(null);
        setSelectedIssueId(null);
        setCursor(undefined);
        setLoadedIssues([]);
        setNextCursor(null);
        onStatusFilterChange(status);
      }}
      runningCheck={runCheck.isPending}
      search={search}
      statusFilter={statusFilter}
      world={world}
    />
  );
}

type ConsistencyIssuesContentProps = ConsistencyIssuesPageProps & {
  statusFilter: ConsistencyIssueStatusFilter;
  search: string;
  onStatusFilterChange: (status: ConsistencyIssueStatusFilter) => void;
  onSearchChange: (search: string) => void;
};

function ConsistencySummary({ issues }: { issues: ConsistencyIssue[] }) {
  const highCount = issues.filter((issue) => issue.severity === "critical" || issue.severity === "high").length;
  const subjectCount = new Set(issues.flatMap((issue) => getSubjectAssetIds(issue))).size;
  const openCount = issues.filter((issue) => issue.status === "open").length;

  return (
    <section className="card" aria-label="矛盾概览" style={{ padding: 14, marginBottom: 14 }}>
      <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h2 className="title-font" style={{ fontSize: "var(--t-15)" }}>矛盾概览</h2>
        <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>triage</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8 }}>
        <div className="card" style={{ padding: 10, background: "var(--surface-2)" }}>
          <span className="badge brick">高优先级</span>
          <div className="mono" style={{ marginTop: 8, fontSize: "var(--t-18)", color: "var(--fg)" }}>{highCount}</div>
        </div>
        <div className="card" style={{ padding: 10, background: "var(--surface-2)" }}>
          <StatusPill status="open" />
          <div className="mono" style={{ marginTop: 8, fontSize: "var(--t-18)", color: "var(--fg)" }}>{openCount}</div>
        </div>
        <div className="card" style={{ padding: 10, background: "var(--surface-2)" }}>
          <span className="badge slate">涉及资产</span>
          <div className="mono" style={{ marginTop: 8, fontSize: "var(--t-18)", color: "var(--fg)" }}>{subjectCount}</div>
        </div>
      </div>
    </section>
  );
}

function ConsistencyIssuesContent({
  world,
  issues = [],
  loading = false,
  loadingMore = false,
  runningCheck = false,
  error,
  detailIssue,
  detailLoading = false,
  actionPending = false,
  actionError,
  actionNotice,
  statusFilter,
  search,
  nextCursor,
  onStatusFilterChange,
  onSearchChange,
  onClearActionError,
  onCreateRepairSession,
  onRunCheck,
  onOpenIssue,
  onIgnoreIssue,
  onLoadMore,
  onReopenIssue,
}: ConsistencyIssuesContentProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [localActionError, setLocalActionError] = useState<string | null>(null);
  const [localActionNotice, setLocalActionNotice] = useState<string | null>(null);
  const filteredIssues = useMemo(
    () => filterIssues(issues, statusFilter, search),
    [issues, search, statusFilter],
  );
  const activeIssueId = selectedIssueId;
  const activeIssue = activeIssueId
    ? detailIssue ?? filteredIssues.find((issue) => issue.id === activeIssueId) ?? null
    : null;

  useEffect(() => {
    if (selectedIssueId && !filteredIssues.some((issue) => issue.id === selectedIssueId)) {
      setSelectedIssueId(null);
    }
  }, [filteredIssues, selectedIssueId]);

  const handleOpenIssue = (issueId: string) => {
    setSelectedIssueId(issueId);
    onOpenIssue?.(issueId);
  };
  const handleAction = (action: (() => void | Promise<void>) | undefined) => {
    if (!action) return;
    setLocalActionError(null);
    setLocalActionNotice(null);
    onClearActionError?.();
    void Promise.resolve(action()).catch((actionErrorValue: unknown) => {
      setLocalActionError(getErrorMessage(actionErrorValue));
    });
  };
  const handleRunCheck = () => {
    if (!onRunCheck) return;
    setLocalActionError(null);
    setLocalActionNotice(null);
    onClearActionError?.();
    void Promise.resolve(onRunCheck())
      .then(() => setLocalActionNotice("检查完成"))
      .catch((actionErrorValue: unknown) => {
        setLocalActionError(getErrorMessage(actionErrorValue));
      });
  };
  const visibleActionError = localActionError ?? actionError ?? null;
  const visibleActionNotice = actionNotice ?? localActionNotice;
  const showSummary = !loading && !error;

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name ?? "world"} / <span style={{ color: "var(--fg-1)" }}>consistency</span>
          </div>
          <h1>矛盾</h1>
          <div className="sub">
            {loading ? "正在载入一致性问题" : `${filteredIssues.length} 项${getStatusLabel(statusFilter)}问题`}
          </div>
        </div>
        <button
          className="btn"
          disabled={runningCheck || !onRunCheck}
          onClick={handleRunCheck}
          type="button"
        >
          <Icon name="refresh" size={12} />
          <span>{runningCheck ? "检查中" : "运行检查"}</span>
        </button>
      </div>

      <div
        style={{
          padding: "12px 32px",
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div aria-label="状态筛选" className="row gap-2" role="group" style={{ flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((status) => (
            <button
              aria-pressed={statusFilter === status.id}
              className={"sb-btn " + (statusFilter === status.id ? "primary" : "")}
              key={status.id}
              onClick={() => onStatusFilterChange(status.id)}
              style={{ height: 28, justifyContent: "center", letterSpacing: 0, minWidth: 64 }}
              type="button"
            >
              <span>{status.label}</span>
            </button>
          ))}
        </div>
        <input
          aria-label="搜索一致性问题"
          className="input"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索问题..."
          style={{ width: "min(100%, 320px)", height: 28, fontSize: 12 }}
          value={search}
        />
      </div>

      {visibleActionError ? (
        <div
          className="row gap-2"
          role="alert"
          style={{
            margin: "12px 32px 0",
            padding: "10px 12px",
            border: "1px solid var(--hairline)",
            borderRadius: 6,
            color: "var(--brick)",
            background: "var(--surface-1)",
            fontSize: "var(--t-12)",
          }}
        >
          <Icon name="info" size={13} />
          <span>{visibleActionError}</span>
        </div>
      ) : visibleActionNotice ? (
        <div
          className="row gap-2"
          role="status"
          style={{
            margin: "12px 32px 0",
            padding: "10px 12px",
            border: "1px solid var(--hairline)",
            borderRadius: 6,
            color: "var(--sage)",
            background: "var(--surface-1)",
            fontSize: "var(--t-12)",
          }}
        >
          <Icon name="check" size={13} />
          <span>{visibleActionNotice}</span>
        </div>
      ) : null}

      <div className="page-body page-body-fluid">
        {showSummary ? <ConsistencySummary issues={filteredIssues} /> : null}

        <div
          className="page-split"
          style={{
            flex: 1,
            minHeight: 0,
            alignItems: "start",
          }}
        >
          <section aria-label="矛盾列表" className="page-split-main">
            {error ? (
              <ConsistencyIssuesError error={error} />
            ) : loading ? (
              <ConsistencyIssuesLoading />
            ) : filteredIssues.length === 0 ? (
              <ConsistencyIssuesEmpty status={statusFilter} />
            ) : (
              <div className="col gap-2">
                {filteredIssues.map((issue) => (
                  <ConsistencyIssueRow
                    active={issue.id === activeIssueId}
                    issue={issue}
                    key={issue.id}
                    onOpenIssue={handleOpenIssue}
                  />
                ))}
              </div>
            )}
            {nextCursor ? (
              <ConsistencyIssuesPaginationNotice
                loadedCount={issues.length}
                loadingMore={loadingMore}
                onLoadMore={onLoadMore ? () => handleAction(onLoadMore) : undefined}
              />
            ) : null}
          </section>

          <div className="page-split-aside">
            <ConsistencyIssueDetail
              actionPending={actionPending}
              issue={activeIssue}
              loading={detailLoading}
              onCreateRepairSession={onCreateRepairSession ? (issue) => handleAction(() => onCreateRepairSession(issue)) : undefined}
              onIgnoreIssue={onIgnoreIssue ? (issueId) => handleAction(() => onIgnoreIssue(issueId)) : undefined}
              onReopenIssue={onReopenIssue ? (issueId) => handleAction(() => onReopenIssue(issueId)) : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsistencyIssueRow({
  issue,
  active,
  onOpenIssue,
}: {
  issue: ConsistencyIssue;
  active: boolean;
  onOpenIssue: (issueId: string) => void;
}) {
  const subjectCount = getSubjectAssetIds(issue).length;

  return (
    <button
      className="card"
      onClick={() => onOpenIssue(issue.id)}
      style={{
        padding: 14,
        textAlign: "left",
        width: "100%",
        borderColor: active ? "var(--amber)" : undefined,
        background: active ? "var(--surface-1)" : undefined,
      }}
      type="button"
    >
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
        <span className={getSeverityBadgeClass(issue.severity)}>{getSeverityLabel(issue.severity)}</span>
        <StatusPill status={issue.status} />
        <span className="mono" style={{ marginLeft: "auto", color: "var(--fg-3)", fontSize: 11 }}>
          {formatUpdatedAt(issue.updatedAt)}
        </span>
      </div>
      <div style={{ color: "var(--fg)", fontSize: "var(--t-14)", fontWeight: 650, lineHeight: 1.4, marginBottom: 6 }}>
        {issue.title}
      </div>
      <div className="row gap-2" style={{ color: "var(--fg-2)", fontSize: "var(--t-12)", alignItems: "center" }}>
        <Icon name="assets" size={12} />
        <span>{subjectCount} 项资产</span>
      </div>
    </button>
  );
}

function ConsistencyIssuesLoading() {
  return (
    <div className="row gap-2" style={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
      <span className="dot amber pulse" />
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
        正在载入一致性问题
      </span>
    </div>
  );
}

function ConsistencyIssuesError({ error }: { error: unknown }) {
  return (
    <div className="card" style={{ padding: 16, maxWidth: 520 }}>
      <div className="row gap-2" style={{ color: "var(--brick)", marginBottom: 6 }}>
        <Icon name="info" size={13} />
        <span style={{ fontSize: "var(--t-13)", fontWeight: 600 }}>一致性问题暂不可用</span>
      </div>
      <div className="prose" style={{ fontSize: "var(--t-12)", color: "var(--fg-2)", lineHeight: 1.55 }}>
        {getErrorMessage(error)}
      </div>
    </div>
  );
}

function ConsistencyIssuesEmpty({ status }: { status: ConsistencyIssueStatusFilter }) {
  return (
    <div
      className="card"
      style={{
        padding: 18,
        minHeight: 160,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fg-3)",
      }}
    >
      <span className="mono" style={{ fontSize: 12 }}>
        暂无{getStatusLabel(status)}问题
      </span>
    </div>
  );
}

function ConsistencyIssuesPaginationNotice({
  loadedCount,
  loadingMore,
  onLoadMore,
}: {
  loadedCount: number;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div
      className="row gap-2"
      style={{
        marginTop: 12,
        padding: 12,
        alignItems: "center",
        border: "1px solid var(--hairline)",
        borderRadius: 6,
        background: "var(--surface-1)",
        color: "var(--fg-2)",
        flexWrap: "wrap",
      }}
    >
      <Icon name="info" size={13} />
      <span style={{ fontSize: "var(--t-12)", lineHeight: 1.5 }}>
        仅显示已加载的前 {loadedCount} 项，搜索只覆盖当前已加载结果。
      </span>
      <div className="flex" />
      <button
        className="btn sm"
        disabled={loadingMore || !onLoadMore}
        onClick={onLoadMore}
        type="button"
      >
        <Icon name="chevdown" size={12} />
        <span>{loadingMore ? "加载中" : "加载更多"}</span>
      </button>
    </div>
  );
}

function mergeConsistencyIssues(
  current: ConsistencyIssue[],
  incoming: ConsistencyIssue[],
) {
  const issues = new Map(current.map((issue) => [issue.id, issue]));
  for (const issue of incoming) issues.set(issue.id, issue);
  return [...issues.values()];
}

function filterIssues(
  issues: ConsistencyIssue[],
  status: ConsistencyIssueStatusFilter,
  search: string,
) {
  const q = search.trim().toLowerCase();

  return issues.filter((issue) => {
    if (issue.status !== status) return false;
    if (!q) return true;

    return [
      issue.title,
      issue.description,
      issue.severity,
      issue.status,
      ...getSubjectAssetIds(issue),
    ].some((value) => String(value ?? "").toLowerCase().includes(q));
  });
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

function StatusPill({ status }: { status: ConsistencyIssue["status"] }) {
  const tone = getStatusTone(status);

  return (
    <span
      style={{
        alignItems: "center",
        background: `var(--${tone}-bg)`,
        borderRadius: 99,
        color: `var(--${tone})`,
        display: "inline-flex",
        fontSize: 11,
        fontWeight: 650,
        height: 18,
        justifyContent: "center",
        letterSpacing: 0,
        lineHeight: 1,
        minWidth: 44,
        padding: "0 7px",
        whiteSpace: "nowrap",
      }}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function getStatusTone(status: ConsistencyIssue["status"]) {
  const tones: Record<ConsistencyIssue["status"], "amber" | "slate" | "sage"> = {
    open: "amber",
    repairing: "slate",
    resolved: "sage",
    ignored: "slate",
  };

  return tones[status] ?? "slate";
}

function getRunCheckNotice(issueCount: number) {
  if (issueCount === 0) return "检查完成，未发现新的待处理问题";
  return `检查完成，发现 ${issueCount} 项待处理问题`;
}

function formatUpdatedAt(updatedAt: string | undefined) {
  if (!updatedAt) return "未更新";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "未更新";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "请稍后重试。";
}
