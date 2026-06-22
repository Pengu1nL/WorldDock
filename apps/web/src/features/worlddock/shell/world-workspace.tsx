"use client";

import type { AgentSession, AgentSessionMessage } from "@worlddock/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionHistoryPanel } from "../../agent-sessions/session-history-panel";
import { PotentialAssetDrawer } from "../../agent-sessions/potential-asset-drawer";
import { SessionPage } from "../../agent-sessions/session-page";
import { ConsistencyRepairPanel } from "../../consistency/consistency-repair-panel";
import { ConsistencyIssuesPage } from "../../consistency/consistency-issues-page";
import {
  invalidateConsistencyIssueQueries,
  useConsistencyIssueDetail,
  type ConsistencyIssue,
} from "../../consistency/use-consistency";
import { AssetMarkdownView } from "../../world-assets/asset-markdown-view";
import { AssetPatchList } from "../../world-assets/asset-patch-list";
import { OfficialAssetDetailPage } from "../../world-assets/official-asset-detail-page";
import { OfficialAssetLibraryPage } from "../../world-assets/official-asset-library-page";
import {
  invalidateOfficialAssetDetailAndPatches,
  officialAssetsQueryKeys,
  useCreateAssetEditSession,
  useOfficialAssetPatches,
  useRevertOfficialAssetPatch,
} from "../../world-assets/use-official-assets";
import {
  EXPLORATION_HISTORY_QUERY,
  agentSessionKeys,
  agentSessionsFeatureEnabled,
  isAgentSessionNotFoundError,
  useArchiveAgentSession,
  useCreateExplorationSession,
  useCreateSessionRun,
  useCurrentExplorationSession,
  useDismissPotentialAsset,
  useExplorationSessionList,
  usePromotePotentialAsset,
  useSetCurrentAgentSession,
  useSessionPotentialAssets,
  useStreamSessionRun,
} from "../../agent-sessions/use-agent-session";
import {
  cancelAgentRun,
  createConsistencyRepairSession,
  createNarrative,
  getAgentSession,
  getOfficialAsset,
  listNarratives,
  revertConsistencyPatchBatch,
  type AgentSessionDetail,
  type AgentSessionRunEvent,
  type OfficialWorldAsset,
  type WorldAssetDetail,
  type WorldAssetPatch,
  type WorldAssetPatchBatch,
} from "../api";
import { Icon } from "../components";
import { SettingsView } from "../view-settings";
import { Composer, Message } from "../view-workbench";
import type { WorldDockView } from "./world-navigation";

export type WorldDockRuntimeState = {
  messages: any[];
  agentBusy: boolean;
};

export type WorldDockActions = {
  setMessages: any;
  startAgentRun: (text: string) => void;
  stopAgent: () => void;
  setDrawerOpen: any;
  setView: (view: WorldDockView) => void;
  pushToast: (toast: any) => void;
};

type WorldWorkspaceProps = {
  view: WorldDockView;
  currentWorld: any;
  worldState: WorldDockRuntimeState;
  actions: WorldDockActions;
};

type PotentialAssetPendingAction = {
  assetId: string;
  action: "dismiss" | "promote";
  sessionId: string | null;
} | null;

export function WorldWorkspace({
  view,
  currentWorld,
  worldState,
  actions,
}: WorldWorkspaceProps) {
  const {
    messages,
    agentBusy,
  } = worldState;
  const {
    setMessages,
    startAgentRun,
    stopAgent,
    setDrawerOpen,
    setView,
    pushToast,
  } = actions;

  return (
    <>
      {view === "exploration" && currentWorld && (
        <ExplorationWorkspace
          world={currentWorld}
          messages={messages}
          agentBusy={agentBusy}
          setMessages={setMessages}
          startAgentRun={startAgentRun}
          stopAgent={stopAgent}
          setDrawerOpen={setDrawerOpen}
          pushToast={pushToast}
        />
      )}
      {view === "asset-library" && currentWorld && (
        <AssetLibraryWorkspace
          world={currentWorld}
          pushToast={pushToast}
        />
      )}
      {view === "consistency" && currentWorld && (
        <ConsistencyWorkspace
          world={currentWorld}
          pushToast={pushToast}
        />
      )}
      {view === "stories" && currentWorld && (
        <StoriesWorkspace world={currentWorld} />
      )}
      {view === "settings" && (
        <SettingsView
          onBack={() => setView("worlds")}
          onToast={pushToast}
          currentWorld={currentWorld}
        />
      )}
    </>
  );
}

const ExplorationWorkspace = ({
  world,
  messages,
  agentBusy,
  setMessages,
  startAgentRun,
  stopAgent,
  setDrawerOpen,
  pushToast,
}: any) => {
  const sessionsEnabled = agentSessionsFeatureEnabled();
  const sessionQuery = useCurrentExplorationSession(sessionsEnabled ? world : null);
  const sessionDetail = sessionQuery.data;
  const sessionId = sessionDetail?.session.id;
  const queryClient = useQueryClient();
  const historyQuery = useExplorationSessionList(sessionsEnabled ? world?.id : null);
  const potentialAssetsQuery = useSessionPotentialAssets(sessionsEnabled ? world?.id : null, sessionId);
  const setCurrentSession = useSetCurrentAgentSession(world?.id);
  const archiveSession = useArchiveAgentSession(world?.id);
  const createSession = useCreateExplorationSession(sessionsEnabled ? world : null);
  const createRun = useCreateSessionRun(world?.id, sessionId);
  const promotePotentialAsset = usePromotePotentialAsset(world?.id, sessionId);
  const dismissPotentialAsset = useDismissPotentialAsset(world?.id, sessionId);
  const streamRun = useStreamSessionRun(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionRunIdRef = useRef<string | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<AgentSessionMessage[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [tokens, setTokens] = useState(0);
  const [forceLegacyFallback, setForceLegacyFallback] = useState(false);
  const [potentialAssetDrawerOpen, setPotentialAssetDrawerOpen] = useState(false);
  const [potentialAssetActionError, setPotentialAssetActionError] = useState<string | null>(null);
  const [potentialAssetPendingAction, setPotentialAssetPendingAction] = useState<PotentialAssetPendingAction>(null);
  const potentialAssetPendingActionRef = useRef<PotentialAssetPendingAction>(null);
  const potentialAssets = potentialAssetsQuery.data ?? [];
  const activePotentialAssetCount = potentialAssets.filter((asset) => asset.status === "active").length;

  const setPotentialAssetPending = useCallback((nextPendingAction: PotentialAssetPendingAction) => {
    potentialAssetPendingActionRef.current = nextPendingAction;
    setPotentialAssetPendingAction(nextPendingAction);
  }, []);

  const cancelActiveSessionRun = useCallback(() => {
    const runId = activeSessionRunIdRef.current;
    if (runId) void cancelAgentRun(runId);
    activeSessionRunIdRef.current = null;
  }, []);

  const resetSessionRuntime = useCallback(() => {
    cancelActiveSessionRun();
    abortRef.current?.abort();
    abortRef.current = null;
    setOptimisticMessages([]);
    setRunState("idle");
    setTokens(0);
    setPotentialAssetDrawerOpen(false);
    setPotentialAssetActionError(null);
    setPotentialAssetPending(null);
  }, [cancelActiveSessionRun, setPotentialAssetPending]);

  useEffect(() => {
    resetSessionRuntime();
    setForceLegacyFallback(false);
  }, [resetSessionRuntime, sessionId]);

  useEffect(() => () => {
    cancelActiveSessionRun();
    abortRef.current?.abort();
    abortRef.current = null;
  }, [cancelActiveSessionRun]);

  const renderLegacy = () => (
    <LegacyExplorationWorkspace
      world={world}
      messages={messages}
      agentBusy={agentBusy}
      setMessages={setMessages}
      startAgentRun={startAgentRun}
      stopAgent={stopAgent}
      setDrawerOpen={setDrawerOpen}
    />
  );

  const handleSessionSend = useCallback(async (text: string) => {
    if (!world?.id || !sessionId || runState === "running") return;

    const now = new Date().toISOString();
    const seed = `${Date.now()}`;
    const userMessage: AgentSessionMessage = {
      id: `optimistic_user_${seed}`,
      sessionId,
      role: "user",
      content: text,
      status: "complete",
      metadata: {},
      createdAt: now,
    };
    const assistantMessage: AgentSessionMessage = {
      id: `optimistic_assistant_${seed}`,
      sessionId,
      role: "assistant",
      content: "",
      status: "streaming",
      metadata: {},
      createdAt: now,
    };

    const abortController = new AbortController();
    let terminalStatus: "running" | "completed" | "failed" = "running";
    const toolLabelsByCallId = new Map<string, string>();
    abortRef.current = abortController;
    setRunState("running");
    setTokens(0);
    setOptimisticMessages([userMessage, assistantMessage]);

    try {
      const { run } = await createRun.mutateAsync(text);
      activeSessionRunIdRef.current = run.id;
      if (abortRef.current !== abortController) {
        void cancelAgentRun(run.id);
        activeSessionRunIdRef.current = null;
        return;
      }

      await streamRun.mutateAsync({
        runId: run.id,
        signal: abortController.signal,
        onEvent: (event) => {
          if (abortRef.current !== abortController) return;
          const updateAssistant = (
            updater: (message: AgentSessionMessage) => AgentSessionMessage,
          ) => {
            setOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id ? updater(message) : message,
            ));
          };
          if (event.type === "message.delta") {
            updateAssistant((message) => ({ ...message, content: `${message.content}${event.payload.text}` }));
          }
          if (event.type === "potential_asset.detected") {
            void queryClient.invalidateQueries({
              queryKey: agentSessionKeys.potentialAssetsForSession(world.id, sessionId),
            });
          }
          if (event.type === "tool.requested") {
            const label = toolLabelForName(event.payload.toolCall.name);
            toolLabelsByCallId.set(event.payload.toolCall.id, label);
            updateAssistant((message) => ({
              ...message,
              metadata: {
                ...getRecordMetadata(message.metadata),
                toolStatus: "running",
                toolLabel: label,
              },
            }));
          }
          if (event.type === "tool.completed") {
            const label = toolLabelsByCallId.get(event.payload.toolCallId) ?? toolLabelFromCompletedEvent(event);
            updateAssistant((message) => ({
              ...message,
              metadata: {
                ...getRecordMetadata(message.metadata),
                toolStatus: "complete",
                toolLabel: label,
              },
            }));
            const createdAsset = getCreatedOfficialAssetFromToolCompletedEvent(event);
            if (createdAsset && createdAsset.worldId === world.id) {
              void queryClient.invalidateQueries({ queryKey: officialAssetsQueryKeys.lists(world.id) });
              void queryClient.invalidateQueries({ queryKey: ["world-assets", world.id] });
              pushToast?.({ kind: "save", text: `正式资产已创建 · ${createdAsset.name}` });
            }
          }
          if (event.type === "run.completed") {
            terminalStatus = "completed";
            activeSessionRunIdRef.current = null;
            setRunState("completed");
            setTokens(event.payload.tokenUsage?.totalTokens ?? 0);
            updateAssistant((message) => ({ ...message, status: "complete", metadata: completeRunningToolStatus(message.metadata) }));
          }
          if (event.type === "run.failed") {
            terminalStatus = "failed";
            activeSessionRunIdRef.current = null;
            setRunState("failed");
            updateAssistant((message) => ({
              ...message,
              status: "failed",
              content: message.content || event.payload.message || "推演失败",
              metadata: failRunningToolStatus(message.metadata, event.payload.message || "推演失败", event.payload.code),
            }));
            pushToast?.({ kind: "warn", text: event.payload.message || "推演失败" });
          }
          if (event.type === "run.cancelled") {
            terminalStatus = "failed";
            activeSessionRunIdRef.current = null;
            setRunState("failed");
            updateAssistant((message) => ({
              ...message,
              status: "failed",
              content: `${message.content || "推演已取消"}`,
              metadata: failRunningToolStatus(message.metadata, event.payload.reason || "推演已取消", "RUN_CANCELLED"),
            }));
          }
        },
      });

      if (abortRef.current !== abortController) return;
      abortRef.current = null;
      if (terminalStatus === "running") terminalStatus = "completed";
      activeSessionRunIdRef.current = null;
      setRunState(terminalStatus);
      if (terminalStatus !== "completed") return;

      setOptimisticMessages([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentSessionKeys.detail(world.id, sessionId) }),
        queryClient.invalidateQueries({
          queryKey: agentSessionKeys.currentDetail(world.id, {
            kind: "world_exploration",
            current: true,
            includeArchived: false,
            limit: 1,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: agentSessionKeys.list(world.id, {
            kind: "world_exploration",
            current: true,
            includeArchived: false,
            limit: 1,
          }),
        }),
        queryClient.invalidateQueries({ queryKey: agentSessionKeys.list(world.id, EXPLORATION_HISTORY_QUERY) }),
        queryClient.invalidateQueries({ queryKey: agentSessionKeys.potentialAssetsForSession(world.id, sessionId) }),
      ]);
    } catch (error) {
      if (abortRef.current !== abortController) return;
      if (isAbortError(error)) return;
      if (isAgentSessionNotFoundError(error)) {
        cancelActiveSessionRun();
        abortRef.current?.abort();
        abortRef.current = null;
        setOptimisticMessages([]);
        setRunState("idle");
        setTokens(0);
        setForceLegacyFallback(true);
        return;
      }
      cancelActiveSessionRun();
      abortRef.current = null;
      setRunState("failed");
      setOptimisticMessages((prev) => prev.map((message) =>
        message.id === assistantMessage.id
          ? {
            ...message,
            status: "failed",
            content: message.content || "Agent 调用失败",
            metadata: failRunningToolStatus(
              message.metadata,
              error instanceof Error && error.message.trim() ? error.message : "Agent 调用失败",
              "CLIENT_STREAM_FAILED",
            ),
          }
          : message,
      ));
    }
  }, [cancelActiveSessionRun, createRun, pushToast, queryClient, runState, sessionId, streamRun, world]);

  const handleSessionStop = useCallback(() => {
    cancelActiveSessionRun();
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState("failed");
    setOptimisticMessages((prev) => prev.map((message) =>
      message.status === "streaming"
        ? {
          ...message,
          status: "failed",
          content: `${message.content || "推演已停止"}`,
          metadata: failRunningToolStatus(message.metadata, "推演已停止", "RUN_STOPPED"),
        }
        : message,
    ));
  }, [cancelActiveSessionRun]);

  const handleOpenSession = useCallback(async (nextSessionId: string) => {
    if (!world?.id || nextSessionId === sessionId) return;
    resetSessionRuntime();
    await setCurrentSession.mutateAsync(nextSessionId);
    await sessionQuery.refetch();
  }, [resetSessionRuntime, sessionId, sessionQuery, setCurrentSession, world?.id]);

  const handleArchiveSession = useCallback(async (targetSessionId: string) => {
    if (!world?.id) return;
    if (targetSessionId === sessionId) resetSessionRuntime();
    await archiveSession.mutateAsync(targetSessionId);
    if (targetSessionId === sessionId) await sessionQuery.refetch();
  }, [archiveSession, resetSessionRuntime, sessionId, sessionQuery, world?.id]);

  const handleCreateSession = useCallback(async () => {
    if (!world?.id) return;
    resetSessionRuntime();
    await createSession.mutateAsync(undefined);
    await sessionQuery.refetch();
  }, [createSession, resetSessionRuntime, sessionQuery, world?.id]);

  const handlePromotePotentialAsset = useCallback(async (potentialAssetId: string) => {
    if (potentialAssetPendingActionRef.current) return;
    const pendingAction = { assetId: potentialAssetId, action: "promote" as const, sessionId: sessionId ?? null };
    setPotentialAssetActionError(null);
    setPotentialAssetPending(pendingAction);
    try {
      await promotePotentialAsset.mutateAsync(potentialAssetId);
      if (potentialAssetPendingActionRef.current !== pendingAction) return;
      pushToast?.({ kind: "save", text: "潜在资产已沉淀" });
    } catch (error) {
      if (potentialAssetPendingActionRef.current !== pendingAction) return;
      const message = getActionErrorMessage(error, "沉淀失败，请重试");
      setPotentialAssetActionError(message);
      pushToast?.({ kind: "warn", text: message });
    } finally {
      if (potentialAssetPendingActionRef.current === pendingAction) setPotentialAssetPending(null);
    }
  }, [promotePotentialAsset, pushToast, sessionId, setPotentialAssetPending]);

  const handleDismissPotentialAsset = useCallback(async (potentialAssetId: string) => {
    if (potentialAssetPendingActionRef.current) return;
    const pendingAction = { assetId: potentialAssetId, action: "dismiss" as const, sessionId: sessionId ?? null };
    setPotentialAssetActionError(null);
    setPotentialAssetPending(pendingAction);
    try {
      await dismissPotentialAsset.mutateAsync(potentialAssetId);
      if (potentialAssetPendingActionRef.current !== pendingAction) return;
      pushToast?.({ kind: "save", text: "潜在资产已忽略" });
    } catch (error) {
      if (potentialAssetPendingActionRef.current !== pendingAction) return;
      const message = getActionErrorMessage(error, "忽略失败，请重试");
      setPotentialAssetActionError(message);
      pushToast?.({ kind: "warn", text: message });
    } finally {
      if (potentialAssetPendingActionRef.current === pendingAction) setPotentialAssetPending(null);
    }
  }, [dismissPotentialAsset, pushToast, sessionId, setPotentialAssetPending]);

  if (!sessionsEnabled || forceLegacyFallback) return renderLegacy();
  if (sessionQuery.isPending) return <SessionLoadingState world={world} />;
  if (isAgentSessionNotFoundError(sessionQuery.error)) return renderLegacy();
  if (sessionQuery.isError) {
    return (
      <SessionErrorState
        message={sessionQuery.error instanceof Error ? sessionQuery.error.message : "Session 加载失败"}
        onRetry={() => sessionQuery.refetch()}
      />
    );
  }
  if (!sessionDetail) return <SessionLoadingState world={world} />;

  return (
    <>
      <SessionPage
        session={sessionDetail.session}
        subjects={sessionDetail.subjects}
        messages={[...sessionDetail.messages, ...optimisticMessages]}
        contextItems={sessionDetail.contextItems}
        runState={{ status: runState, tokens }}
        onSend={handleSessionSend}
        onStop={handleSessionStop}
        potentialAssetCount={potentialAssets.length}
        activePotentialAssetCount={activePotentialAssetCount}
        onOpenPotentialAssets={() => setPotentialAssetDrawerOpen(true)}
        rightSlot={null}
        floatingSlot={(
          <FloatingSessionHistory
            sessions={historyQuery.data ?? []}
            activeSessionId={sessionId}
            isLoading={historyQuery.isPending}
            isCreating={createSession.isPending}
            onCreate={handleCreateSession}
            onOpen={handleOpenSession}
            onArchive={handleArchiveSession}
          />
        )}
      />
      <PotentialAssetDrawer
        open={potentialAssetDrawerOpen}
        potentialAssets={potentialAssets}
        pendingAction={potentialAssetPendingAction}
        error={potentialAssetActionError}
        onClose={() => setPotentialAssetDrawerOpen(false)}
        onPromote={handlePromotePotentialAsset}
        onDismiss={handleDismissPotentialAsset}
      />
    </>
  );
};

type FloatingSessionHistoryProps = {
  sessions: AgentSession[];
  activeSessionId?: string | null;
  isLoading?: boolean;
  isCreating?: boolean;
  onCreate: () => void;
  onOpen: (sessionId: string) => void;
  onArchive: (sessionId: string) => void;
};

function FloatingSessionHistory({
  sessions,
  activeSessionId,
  isLoading = false,
  isCreating = false,
  onCreate,
  onOpen,
  onArchive,
}: FloatingSessionHistoryProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleCreate = () => {
    onCreate();
    setOpen(false);
  };
  const handleOpen = (sessionId: string) => {
    onOpen(sessionId);
    setOpen(false);
  };

  return (
    <div className="session-history-float" ref={containerRef}>
      <button
        aria-controls={open ? "session-history-floating-panel" : undefined}
        aria-expanded={open}
        className="btn sm session-history-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Icon name="history" size={13} />
        <span>推演历史</span>
      </button>
      {open ? (
        <div
          aria-label="推演历史浮窗"
          className="session-history-popover"
          id="session-history-floating-panel"
          role="dialog"
        >
          <SessionHistoryPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={isLoading}
            isCreating={isCreating}
            onCreate={handleCreate}
            onOpen={handleOpen}
            onArchive={onArchive}
          />
        </div>
      ) : null}
    </div>
  );
}

const LegacyExplorationWorkspace = ({
  world,
  messages,
  agentBusy,
  setMessages,
  startAgentRun,
  stopAgent,
  setDrawerOpen,
}: any) => (
  <Workbench
    world={world}
    messages={messages}
    agentBusy={agentBusy}
    contextRefs={getLatestCompletedContextRefs(messages)}
    onSend={(text: string) => {
      setMessages((prev: any[]) => [...prev, { id: "u_" + Date.now(), role: "user", text }]);
      setTimeout(() => startAgentRun(text), 200);
    }}
    onStop={stopAgent}
    onOpenContext={(snapshot?: any) => setDrawerOpen({ kind: "context", snapshot })}
  />
);

function SessionLoadingState({ world }: { world: any }) {
  return (
    <div className="row gap-2" style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
      <span className="dot amber pulse" />
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
        正在载入 {world?.name ?? "世界"} 推演
      </span>
    </div>
  );
}

function SessionErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="col gap-3" style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
      <span className="mono" style={{ color: "var(--brick)", fontSize: 12 }}>{message}</span>
      <button className="btn sm" type="button" onClick={onRetry}>
        <Icon name="refresh" size={12} />
        <span>重试</span>
      </button>
    </div>
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

const ConsistencyWorkspace = ({
  world,
  pushToast,
}: {
  world: any;
  pushToast?: (toast: any) => void;
}) => {
  const worldId = world?.id as string | undefined;
  const queryClient = useQueryClient();
  const [repairIssue, setRepairIssue] = useState<ConsistencyIssue | null>(null);
  const [repairSessionDetail, setRepairSessionDetail] = useState<AgentSessionDetail | null>(null);
  const [repairOptimisticMessages, setRepairOptimisticMessages] = useState<AgentSessionMessage[]>([]);
  const [repairRunState, setRepairRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [repairTokens, setRepairTokens] = useState(0);
  const [repairBatches, setRepairBatches] = useState<WorldAssetPatchBatch[]>([]);
  const [creatingRepairSession, setCreatingRepairSession] = useState(false);
  const [revertingBatchId, setRevertingBatchId] = useState<string | null>(null);
  const repairAbortRef = useRef<AbortController | null>(null);
  const activeRepairRunIdRef = useRef<string | null>(null);
  const repairSessionId = repairSessionDetail?.session.id ?? null;
  const repairIssueId = repairIssue?.id ?? null;
  const issueDetailQuery = useConsistencyIssueDetail(worldId, repairIssueId);
  const currentIssue = issueDetailQuery.data ?? repairIssue;
  const createRepairRun = useCreateSessionRun(worldId, repairSessionId);
  const streamRepairRun = useStreamSessionRun(null);

  const cancelActiveRepairRun = useCallback(() => {
    const runId = activeRepairRunIdRef.current;
    if (runId) void cancelAgentRun(runId);
    activeRepairRunIdRef.current = null;
  }, []);

  const resetRepairSessionRuntime = useCallback((clearSession = false) => {
    cancelActiveRepairRun();
    repairAbortRef.current?.abort();
    repairAbortRef.current = null;
    setRepairOptimisticMessages([]);
    setRepairRunState("idle");
    setRepairTokens(0);
    setRevertingBatchId(null);
    if (clearSession) {
      setRepairIssue(null);
      setRepairSessionDetail(null);
      setRepairBatches([]);
    }
  }, [cancelActiveRepairRun]);

  useEffect(() => {
    resetRepairSessionRuntime(true);
    setCreatingRepairSession(false);
  }, [resetRepairSessionRuntime, worldId]);

  useEffect(() => () => {
    cancelActiveRepairRun();
    repairAbortRef.current?.abort();
    repairAbortRef.current = null;
  }, [cancelActiveRepairRun]);

  const invalidateRepairData = useCallback((assetIds: string[] = getConsistencySubjectAssetIds(currentIssue)) => {
    invalidateConsistencyRepairData(queryClient, worldId, repairIssueId, assetIds);
  }, [currentIssue, queryClient, repairIssueId, worldId]);

  const handleCreateRepairSession = useCallback(async (issue: ConsistencyIssue) => {
    if (!worldId || !issue?.id || creatingRepairSession) return;

    resetRepairSessionRuntime(true);
    setCreatingRepairSession(true);
    setRepairIssue(issue);
    try {
      const detail = await createConsistencyRepairSession(worldId, issue.id);
      setRepairSessionDetail(detail);
      queryClient.setQueryData(agentSessionKeys.detail(worldId, detail.session.id), detail);
      invalidateConsistencyIssueQueries(queryClient, worldId, issue.id);
      pushToast?.({ kind: "save", text: "矛盾修复会话已创建" });
    } catch (error) {
      pushToast?.({ kind: "warn", text: getActionErrorMessage(error, "创建矛盾修复会话失败") });
    } finally {
      setCreatingRepairSession(false);
    }
  }, [
    creatingRepairSession,
    pushToast,
    queryClient,
    resetRepairSessionRuntime,
    worldId,
  ]);

  const handlePanelCreateRepairSession = useCallback((issueId: string) => {
    if (!currentIssue || currentIssue.id !== issueId) return;
    void handleCreateRepairSession(currentIssue);
  }, [currentIssue, handleCreateRepairSession]);

  const handleRevertRepairBatch = useCallback(async (batchId: string) => {
    if (!worldId || !repairIssueId || revertingBatchId || repairRunState === "running") return;

    setRevertingBatchId(batchId);
    try {
      const { batch } = await revertConsistencyPatchBatch(worldId, repairIssueId, batchId);
      setRepairBatches((current) => mergePatchBatch(current, batch));
      invalidateRepairData();
      await issueDetailQuery.refetch();
      pushToast?.({ kind: "save", text: "修复 batch 已撤销" });
    } catch (error) {
      pushToast?.({ kind: "warn", text: getActionErrorMessage(error, "撤销修复 batch 失败，请重试") });
    } finally {
      setRevertingBatchId(null);
    }
  }, [
    invalidateRepairData,
    issueDetailQuery,
    pushToast,
    repairIssueId,
    repairRunState,
    revertingBatchId,
    worldId,
  ]);

  const handleRepairSessionSend = useCallback(async (text: string) => {
    if (!worldId || !repairIssueId || !repairSessionId || repairRunState === "running") return;

    const now = new Date().toISOString();
    const seed = `${Date.now()}`;
    const userMessage: AgentSessionMessage = {
      id: `optimistic_repair_user_${seed}`,
      sessionId: repairSessionId,
      role: "user",
      content: text,
      status: "complete",
      metadata: {},
      createdAt: now,
    };
    const assistantMessage: AgentSessionMessage = {
      id: `optimistic_repair_assistant_${seed}`,
      sessionId: repairSessionId,
      role: "assistant",
      content: "",
      status: "streaming",
      metadata: {},
      createdAt: now,
    };

    const abortController = new AbortController();
    let terminalStatus: "running" | "completed" | "failed" = "running";
    repairAbortRef.current = abortController;
    setRepairRunState("running");
    setRepairTokens(0);
    setRepairOptimisticMessages([userMessage, assistantMessage]);

    try {
      const { run } = await createRepairRun.mutateAsync(text);
      activeRepairRunIdRef.current = run.id;
      if (repairAbortRef.current !== abortController) {
        void cancelAgentRun(run.id);
        activeRepairRunIdRef.current = null;
        return;
      }

      await streamRepairRun.mutateAsync({
        runId: run.id,
        signal: abortController.signal,
        onEvent: (event) => {
          if (repairAbortRef.current !== abortController) return;
          if (event.type === "message.delta") {
            setRepairOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${event.payload.text}` }
                : message,
            ));
          }
          if (
            event.type === "asset.patch.applied"
            && event.payload.sessionId === repairSessionId
          ) {
            invalidateConsistencyRepairData(queryClient, worldId, repairIssueId, [event.payload.assetId]);
            pushToast?.({ kind: "save", text: "修复补丁已应用" });
          }
          if (
            event.type === "consistency.issue.created"
            && event.payload.worldId === worldId
          ) {
            invalidateConsistencyIssueQueries(queryClient, worldId, event.payload.issueId);
            if (event.payload.issueId === repairIssueId) void issueDetailQuery.refetch();
          }
          if (event.type === "tool.completed") {
            const batch = getPatchBatchFromToolCompletedEvent(event);
            if (batch && (!batch.issueId || batch.issueId === repairIssueId) && batch.sessionId === repairSessionId) {
              setRepairBatches((current) => mergePatchBatch(current, batch));
              invalidateRepairData();
              void issueDetailQuery.refetch();
            }
          }
          if (event.type === "run.completed") {
            terminalStatus = "completed";
            activeRepairRunIdRef.current = null;
            setRepairRunState("completed");
            setRepairTokens(event.payload.tokenUsage?.totalTokens ?? 0);
            setRepairOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "complete" }
                : message,
            ));
          }
          if (event.type === "run.failed") {
            terminalStatus = "failed";
            activeRepairRunIdRef.current = null;
            setRepairRunState("failed");
            setRepairOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: message.content || event.payload.message || "修复失败" }
                : message,
            ));
          }
          if (event.type === "run.cancelled") {
            terminalStatus = "failed";
            activeRepairRunIdRef.current = null;
            setRepairRunState("failed");
            setRepairOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: `${message.content || "修复已取消"}` }
                : message,
            ));
          }
        },
      });

      if (repairAbortRef.current !== abortController) return;
      repairAbortRef.current = null;
      if (terminalStatus === "running") terminalStatus = "completed";
      activeRepairRunIdRef.current = null;
      setRepairRunState(terminalStatus);
      if (terminalStatus !== "completed") return;

      setRepairOptimisticMessages([]);
      invalidateRepairData();
      await issueDetailQuery.refetch();
      const refreshed = await getAgentSession(worldId, repairSessionId);
      setRepairSessionDetail(refreshed);
      queryClient.setQueryData(agentSessionKeys.detail(worldId, repairSessionId), refreshed);
    } catch (error) {
      if (repairAbortRef.current !== abortController) return;
      if (isAbortError(error)) return;
      if (isAgentSessionNotFoundError(error)) {
        resetRepairSessionRuntime(true);
        pushToast?.({ kind: "warn", text: "矛盾修复会话不存在，已返回列表" });
        return;
      }
      cancelActiveRepairRun();
      repairAbortRef.current = null;
      setRepairRunState("failed");
      setRepairOptimisticMessages((prev) => prev.map((message) =>
        message.id === assistantMessage.id
          ? { ...message, status: "failed", content: message.content || "矛盾修复调用失败" }
          : message,
      ));
    }
  }, [
    cancelActiveRepairRun,
    createRepairRun,
    invalidateRepairData,
    issueDetailQuery,
    pushToast,
    queryClient,
    repairIssueId,
    repairRunState,
    repairSessionId,
    resetRepairSessionRuntime,
    streamRepairRun,
    worldId,
  ]);

  const handleRepairSessionStop = useCallback(() => {
    cancelActiveRepairRun();
    repairAbortRef.current?.abort();
    repairAbortRef.current = null;
    setRepairRunState("failed");
    setRepairOptimisticMessages((prev) => prev.map((message) =>
      message.status === "streaming"
        ? { ...message, status: "failed", content: `${message.content || "修复已停止"}` }
        : message,
    ));
  }, [cancelActiveRepairRun]);

  if (repairSessionDetail) {
    return (
      <SessionPage
        backLabel="返回矛盾"
        contextItems={repairSessionDetail.contextItems}
        messages={[...repairSessionDetail.messages, ...repairOptimisticMessages]}
        onBack={() => resetRepairSessionRuntime(true)}
        onSend={handleRepairSessionSend}
        onStop={handleRepairSessionStop}
        rightSlot={(
          <ConsistencyRepairPanel
            batches={repairBatches}
            creatingRepairSession={creatingRepairSession}
            issue={currentIssue}
            onCreateRepairSession={handlePanelCreateRepairSession}
            onRevertBatch={handleRevertRepairBatch}
            repairDisabled={repairRunState === "running"}
            revertDisabled={repairRunState === "running"}
            revertingBatchId={revertingBatchId}
          />
        )}
        runState={{ status: repairRunState, tokens: repairTokens }}
        session={repairSessionDetail.session}
        subjects={repairSessionDetail.subjects}
      />
    );
  }

  return (
    <ConsistencyIssuesPage
      actionPending={creatingRepairSession}
      onCreateRepairSession={handleCreateRepairSession}
      world={world}
    />
  );
};

function invalidateConsistencyRepairData(
  queryClient: ReturnType<typeof useQueryClient>,
  worldId: string | null | undefined,
  issueId: string | null | undefined,
  assetIds: string[],
) {
  invalidateConsistencyIssueQueries(queryClient, worldId, issueId);
  if (!worldId) return;
  void queryClient.invalidateQueries({ queryKey: officialAssetsQueryKeys.world(worldId) });
  for (const assetId of assetIds) {
    invalidateOfficialAssetDetailAndPatches(queryClient, worldId, assetId);
  }
}

function mergePatchBatch(
  current: WorldAssetPatchBatch[],
  incoming: WorldAssetPatchBatch,
) {
  const batches = new Map(current.map((batch) => [batch.id, batch]));
  batches.set(incoming.id, incoming);
  return [...batches.values()].sort((a, b) => {
    const left = Date.parse(b.createdAt ?? "");
    const right = Date.parse(a.createdAt ?? "");
    if (Number.isNaN(left) || Number.isNaN(right)) return b.id.localeCompare(a.id);
    return left - right;
  });
}

function getPatchBatchFromToolCompletedEvent(
  event: Extract<AgentSessionRunEvent, { type: "tool.completed" }>,
): WorldAssetPatchBatch | null {
  const batch = event.payload.result.batch;
  if (!isRecord(batch)) return null;
  if (typeof batch.id !== "string" || typeof batch.worldId !== "string" || typeof batch.sessionId !== "string") {
    return null;
  }
  if (batch.status !== "applied" && batch.status !== "reverted") return null;

  return {
    id: batch.id,
    worldId: batch.worldId,
    sessionId: batch.sessionId,
    issueId: typeof batch.issueId === "string" ? batch.issueId : null,
    status: batch.status,
    patchIds: Array.isArray(batch.patchIds)
      ? batch.patchIds.filter((patchId): patchId is string => typeof patchId === "string")
      : [],
    metadata: isRecord(batch.metadata) ? batch.metadata : {},
    createdAt: typeof batch.createdAt === "string" ? batch.createdAt : new Date().toISOString(),
    appliedAt: typeof batch.appliedAt === "string" ? batch.appliedAt : null,
    revertedAt: typeof batch.revertedAt === "string" ? batch.revertedAt : null,
  };
}

function getRecordMetadata(metadata: AgentSessionMessage["metadata"]): Record<string, unknown> {
  return isRecord(metadata) ? metadata : {};
}

function completeRunningToolStatus(metadata: AgentSessionMessage["metadata"]) {
  const record = getRecordMetadata(metadata);
  if (record.toolStatus !== "running") return record;
  return { ...record, toolStatus: "complete" };
}

function failRunningToolStatus(
  metadata: AgentSessionMessage["metadata"],
  message: string,
  code: string,
) {
  const record = getRecordMetadata(metadata);
  return {
    ...record,
    toolStatus: record.toolStatus === "running" ? "failed" : record.toolStatus,
    message,
    code,
  };
}

function toolLabelForName(name: string) {
  const labels: Record<string, string> = {
    create_world_asset: "创建正式资产",
    apply_world_asset_patch: "应用资产补丁",
    create_consistency_issue: "创建一致性问题",
    propose_setting: "生成待确认设定",
    search_world_assets: "检索世界资产",
    get_world_manifest: "读取世界信息",
  };
  return labels[name] ?? "运行后台工具";
}

function toolLabelFromCompletedEvent(event: Extract<AgentSessionRunEvent, { type: "tool.completed" }>) {
  if (getCreatedOfficialAssetFromToolCompletedEvent(event)) return "创建正式资产";
  if (getPatchBatchFromToolCompletedEvent(event)) return "应用资产补丁";
  return "运行后台工具";
}

function getCreatedOfficialAssetFromToolCompletedEvent(
  event: Extract<AgentSessionRunEvent, { type: "tool.completed" }>,
): OfficialWorldAsset | null {
  const asset = event.payload.result.asset;
  if (!isRecord(asset)) return null;
  if (
    typeof asset.id !== "string" ||
    typeof asset.worldId !== "string" ||
    typeof asset.name !== "string" ||
    typeof asset.summary !== "string" ||
    typeof asset.documentKey !== "string" ||
    typeof asset.version !== "number" ||
    typeof asset.createdAt !== "string" ||
    typeof asset.updatedAt !== "string"
  ) {
    return null;
  }
  if (
    asset.type !== "character" &&
    asset.type !== "organization" &&
    asset.type !== "location" &&
    asset.type !== "event" &&
    asset.type !== "rule"
  ) {
    return null;
  }
  if (asset.status !== "active" && asset.status !== "archived") return null;

  return {
    id: asset.id,
    worldId: asset.worldId,
    type: asset.type,
    name: asset.name,
    summary: asset.summary,
    documentKey: asset.documentKey,
    status: asset.status,
    version: asset.version,
    tags: Array.isArray(asset.tags) ? asset.tags.filter((tag): tag is string => typeof tag === "string") : [],
    metadata: isRecord(asset.metadata) ? asset.metadata : {},
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    archivedAt: typeof asset.archivedAt === "string" ? asset.archivedAt : null,
  };
}

function getConsistencySubjectAssetIds(issue?: ConsistencyIssue | null) {
  return Array.isArray(issue?.subjectAssetIds) ? issue.subjectAssetIds : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const AssetLibraryWorkspace = ({
  world,
  pushToast,
}: any) => {
  const worldId = world?.id as string | undefined;
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editSessionDetail, setEditSessionDetail] = useState<AgentSessionDetail | null>(null);
  const [editOptimisticMessages, setEditOptimisticMessages] = useState<AgentSessionMessage[]>([]);
  const [editRunState, setEditRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [editTokens, setEditTokens] = useState(0);
  const [revertingPatchId, setRevertingPatchId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const editAbortRef = useRef<AbortController | null>(null);
  const activeEditRunIdRef = useRef<string | null>(null);
  const editSessionId = editSessionDetail?.session.id ?? null;

  const assetDetailQuery = useQuery({
    queryKey: officialAssetsQueryKeys.detail(worldId, selectedAssetId),
    queryFn: () => {
      if (!worldId || !selectedAssetId) throw new Error("World id and asset id are required.");
      return getOfficialAsset(worldId, selectedAssetId);
    },
    enabled: Boolean(worldId && selectedAssetId),
    retry: false,
  });
  const patchesQuery = useOfficialAssetPatches(worldId, selectedAssetId);
  const createEditSession = useCreateAssetEditSession(worldId);
  const createEditRun = useCreateSessionRun(worldId, editSessionId);
  const streamEditRun = useStreamSessionRun(null);
  const revertPatch = useRevertOfficialAssetPatch(worldId, selectedAssetId);

  const cancelActiveEditRun = useCallback(() => {
    const runId = activeEditRunIdRef.current;
    if (runId) void cancelAgentRun(runId);
    activeEditRunIdRef.current = null;
  }, []);

  const resetEditSessionRuntime = useCallback((clearSession = false) => {
    cancelActiveEditRun();
    editAbortRef.current?.abort();
    editAbortRef.current = null;
    setEditOptimisticMessages([]);
    setEditRunState("idle");
    setEditTokens(0);
    if (clearSession) setEditSessionDetail(null);
  }, [cancelActiveEditRun]);

  useEffect(() => {
    setSelectedAssetId(null);
    resetEditSessionRuntime(true);
  }, [resetEditSessionRuntime, worldId]);

  useEffect(() => {
    resetEditSessionRuntime(true);
  }, [resetEditSessionRuntime, selectedAssetId]);

  useEffect(() => () => {
    cancelActiveEditRun();
    editAbortRef.current?.abort();
    editAbortRef.current = null;
  }, [cancelActiveEditRun]);

  const handleStartEdit = useCallback(async (assetId: string) => {
    if (!worldId || createEditSession.isPending) return;

    resetEditSessionRuntime(true);
    try {
      const detail = await createEditSession.mutateAsync({ assetId });
      setEditSessionDetail(detail);
      queryClient.setQueryData(agentSessionKeys.detail(worldId, detail.session.id), detail);
      pushToast?.({ kind: "save", text: "资产编辑会话已创建" });
    } catch (error) {
      pushToast?.({ kind: "warn", text: getActionErrorMessage(error, "创建资产编辑会话失败") });
    }
  }, [createEditSession, pushToast, queryClient, resetEditSessionRuntime, worldId]);

  const handleRevertPatch = useCallback(async (patchId: string) => {
    if (!worldId || !selectedAssetId || revertingPatchId || revertPatch.isPending) return;

    setRevertingPatchId(patchId);
    try {
      await revertPatch.mutateAsync(patchId);
      pushToast?.({ kind: "save", text: "资产补丁已撤销" });
    } catch (error) {
      pushToast?.({ kind: "warn", text: getActionErrorMessage(error, "撤销补丁失败，请重试") });
    } finally {
      setRevertingPatchId(null);
    }
  }, [pushToast, revertPatch, revertingPatchId, selectedAssetId, worldId]);

  const handleEditSessionSend = useCallback(async (text: string) => {
    if (!worldId || !selectedAssetId || !editSessionId || editRunState === "running") return;

    const now = new Date().toISOString();
    const seed = `${Date.now()}`;
    const userMessage: AgentSessionMessage = {
      id: `optimistic_asset_user_${seed}`,
      sessionId: editSessionId,
      role: "user",
      content: text,
      status: "complete",
      metadata: {},
      createdAt: now,
    };
    const assistantMessage: AgentSessionMessage = {
      id: `optimistic_asset_assistant_${seed}`,
      sessionId: editSessionId,
      role: "assistant",
      content: "",
      status: "streaming",
      metadata: {},
      createdAt: now,
    };

    const abortController = new AbortController();
    let terminalStatus: "running" | "completed" | "failed" = "running";
    editAbortRef.current = abortController;
    setEditRunState("running");
    setEditTokens(0);
    setEditOptimisticMessages([userMessage, assistantMessage]);

    try {
      const { run } = await createEditRun.mutateAsync(text);
      activeEditRunIdRef.current = run.id;
      if (editAbortRef.current !== abortController) {
        void cancelAgentRun(run.id);
        activeEditRunIdRef.current = null;
        return;
      }

      await streamEditRun.mutateAsync({
        runId: run.id,
        signal: abortController.signal,
        onEvent: (event) => {
          if (editAbortRef.current !== abortController) return;
          if (event.type === "message.delta") {
            setEditOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${event.payload.text}` }
                : message,
            ));
          }
          if (
            event.type === "asset.patch.applied"
            && event.payload.assetId === selectedAssetId
            && event.payload.sessionId === editSessionId
          ) {
            invalidateOfficialAssetDetailAndPatches(queryClient, worldId, selectedAssetId);
            pushToast?.({ kind: "save", text: "资产补丁已应用" });
          }
          if (event.type === "run.completed") {
            terminalStatus = "completed";
            activeEditRunIdRef.current = null;
            setEditRunState("completed");
            setEditTokens(event.payload.tokenUsage?.totalTokens ?? 0);
            setEditOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "complete" }
                : message,
            ));
          }
          if (event.type === "run.failed") {
            terminalStatus = "failed";
            activeEditRunIdRef.current = null;
            setEditRunState("failed");
            setEditOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: message.content || event.payload.message || "编辑失败" }
                : message,
            ));
          }
          if (event.type === "run.cancelled") {
            terminalStatus = "failed";
            activeEditRunIdRef.current = null;
            setEditRunState("failed");
            setEditOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: `${message.content || "编辑已取消"}` }
                : message,
            ));
          }
        },
      });

      if (editAbortRef.current !== abortController) return;
      editAbortRef.current = null;
      if (terminalStatus === "running") terminalStatus = "completed";
      activeEditRunIdRef.current = null;
      setEditRunState(terminalStatus);
      if (terminalStatus !== "completed") return;

      setEditOptimisticMessages([]);
      invalidateOfficialAssetDetailAndPatches(queryClient, worldId, selectedAssetId);
      const refreshed = await getAgentSession(worldId, editSessionId);
      setEditSessionDetail(refreshed);
      queryClient.setQueryData(agentSessionKeys.detail(worldId, editSessionId), refreshed);
    } catch (error) {
      if (editAbortRef.current !== abortController) return;
      if (isAbortError(error)) return;
      if (isAgentSessionNotFoundError(error)) {
        resetEditSessionRuntime(true);
        pushToast?.({ kind: "warn", text: "资产编辑会话不存在，已返回详情" });
        return;
      }
      cancelActiveEditRun();
      editAbortRef.current = null;
      setEditRunState("failed");
      setEditOptimisticMessages((prev) => prev.map((message) =>
        message.id === assistantMessage.id
          ? { ...message, status: "failed", content: message.content || "资产编辑调用失败" }
          : message,
      ));
    }
  }, [
    cancelActiveEditRun,
    createEditRun,
    editRunState,
    editSessionId,
    pushToast,
    queryClient,
    resetEditSessionRuntime,
    selectedAssetId,
    streamEditRun,
    worldId,
  ]);

  const handleEditSessionStop = useCallback(() => {
    cancelActiveEditRun();
    editAbortRef.current?.abort();
    editAbortRef.current = null;
    setEditRunState("failed");
    setEditOptimisticMessages((prev) => prev.map((message) =>
      message.status === "streaming"
        ? { ...message, status: "failed", content: `${message.content || "编辑已停止"}` }
        : message,
    ));
  }, [cancelActiveEditRun]);

  if (selectedAssetId && editSessionDetail) {
    return (
      <SessionPage
        backLabel="返回资产"
        contextItems={editSessionDetail.contextItems}
        messages={[...editSessionDetail.messages, ...editOptimisticMessages]}
        onBack={() => resetEditSessionRuntime(true)}
        onSend={handleEditSessionSend}
        onStop={handleEditSessionStop}
        rightSlot={(
          <AssetEditSessionPanel
            detail={assetDetailQuery.data ?? null}
            detailLoading={assetDetailQuery.isLoading}
            onBackToDetail={() => resetEditSessionRuntime(true)}
            onRevertPatch={handleRevertPatch}
            patches={patchesQuery.data ?? []}
            patchesError={patchesQuery.error}
            patchesLoading={patchesQuery.isLoading}
            revertDisabled={editRunState === "running"}
            revertingPatchId={revertingPatchId}
          />
        )}
        runState={{ status: editRunState, tokens: editTokens }}
        session={editSessionDetail.session}
        subjects={editSessionDetail.subjects}
      />
    );
  }

  if (selectedAssetId) {
    return (
      <OfficialAssetDetailPage
        detail={assetDetailQuery.data ?? null}
        error={assetDetailQuery.error}
        loading={assetDetailQuery.isLoading}
        creatingEditSession={createEditSession.isPending}
        onBack={() => setSelectedAssetId(null)}
        onRefresh={() => {
          void assetDetailQuery.refetch();
          void patchesQuery.refetch();
        }}
        onRevertPatch={handleRevertPatch}
        onStartEdit={handleStartEdit}
        patches={patchesQuery.data ?? []}
        patchesError={patchesQuery.error}
        patchesLoading={patchesQuery.isLoading}
        revertingPatchId={revertingPatchId}
      />
    );
  }

  return (
    <OfficialAssetLibraryPage
      world={world}
      onOpenAsset={(assetId: string) => setSelectedAssetId(assetId)}
    />
  );
};

function AssetEditSessionPanel({
  detail,
  detailLoading,
  patches,
  patchesLoading,
  patchesError,
  onBackToDetail,
  onRevertPatch,
  revertingPatchId,
  revertDisabled,
}: {
  detail?: WorldAssetDetail | null;
  detailLoading?: boolean;
  patches: WorldAssetPatch[];
  patchesLoading?: boolean;
  patchesError?: unknown;
  onBackToDetail: () => void;
  onRevertPatch: (patchId: string) => void;
  revertingPatchId?: string | null;
  revertDisabled?: boolean;
}) {
  const asset = detail?.asset;

  return (
    <div className="col gap-3">
      <button className="btn" onClick={onBackToDetail} type="button">
        <Icon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} />
        <span>返回详情</span>
      </button>

      <section className="card" style={{ padding: 14 }}>
        <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
          <Icon name="book" size={13} style={{ color: "var(--fg-2)" }} />
          <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
            当前资产
          </span>
          <div className="flex" />
          {asset ? (
            <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
              v{asset.version ?? 1}
            </span>
          ) : null}
        </div>
        {detailLoading && !detail ? (
          <div className="row gap-2" style={{ color: "var(--fg-3)", fontSize: "var(--t-12)" }}>
            <span className="dot amber pulse" />
            <span className="mono">正在载入资产摘要</span>
          </div>
        ) : detail ? (
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            <AssetMarkdownView markdown={detail.markdown} skipFirstHeadingText={detail.asset.name} />
          </div>
        ) : (
          <div className="prose" style={{ color: "var(--fg-3)", fontSize: "var(--t-12)", lineHeight: 1.55 }}>
            资产摘要暂不可用。
          </div>
        )}
      </section>

      <AssetPatchList
        disabled={revertDisabled}
        error={patchesError}
        loading={patchesLoading}
        onRevert={onRevertPatch}
        patches={patches}
        revertingPatchId={revertingPatchId}
      />
    </div>
  );
}

const Workbench = ({
  world, messages, agentBusy,
  onSend, onStop,
  onOpenContext, contextRefs,
}: any) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 0 }}>
        {isEmpty ? (
          <WorkbenchEmpty world={world}/>
        ) : (
          <>
            <div style={{ padding: "20px 0 0", textAlign: "center" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                推演开始 · {world.name}
              </span>
            </div>
            {messages.map((m: any) => (
              <Message
                key={m.id}
                msg={m}
                onOpenContext={() => onOpenContext(m.contextSnapshot)}
              />
            ))}
          </>
        )}
      </div>
      <Composer
        onSend={onSend}
        busy={agentBusy}
        onStop={onStop}
        contextRefs={contextRefs}
        onOpenContext={() => onOpenContext()}
      />
    </div>
  );
};

const WorkbenchEmpty = ({ world }: any) => (
  <div style={{
    maxWidth: 560, margin: "10vh auto 0", padding: "0 24px",
    textAlign: "center",
  }}>
    <div className="title-font" style={{
      fontSize: "var(--t-28)", color: "var(--fg)", marginBottom: 12, letterSpacing: 0,
    }}>{world.name}</div>
    <p style={{ fontSize: "var(--t-14)", color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 30 }}>
      这是一个会继续长出故事的世界。<br/>
      用对话推演它，把值得保存的部分变成档案。
    </p>
    <div className="card" style={{ padding: 16, textAlign: "left" }}>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <Icon name="spark" size={12} style={{ color: "var(--sage)" }}/>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>下一步</span>
      </div>
      <p style={{ fontSize: "var(--t-13)", color: "var(--fg-1)", lineHeight: 1.6 }}>
        在下方输入一个推演方向。Agent 会围绕当前世界继续推演，并把值得保留的内容整理成待确认建议。
      </p>
    </div>
  </div>
);

function getLatestCompletedContextRefs(messages: any[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "agent" && !message.streaming && message.contextRefs) return message.contextRefs;
  }
  return 0;
}

const StoriesWorkspace = ({ world }: { world: any }) => {
  const worldId = world?.id as string | undefined;
  const queryClient = useQueryClient();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const narrativesQuery = useQuery({
    queryKey: ["narratives", worldId],
    queryFn: () => listNarratives({ worldId }),
    enabled: Boolean(worldId),
  });

  const narratives = narrativesQuery.data?.narratives ?? [];

  const handleCreate = useCallback(async () => {
    if (creating) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setCreateError("先输入故事标题");
      titleInputRef.current?.focus();
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createNarrative({ worldId, title: nextTitle });
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["narratives", worldId] });
    } catch (error) {
      setCreateError(getActionErrorMessage(error, "创建故事失败，请重试"));
    } finally {
      setCreating(false);
    }
  }, [creating, queryClient, title, worldId]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "24px 32px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <h1 className="title-font" style={{ fontSize: "var(--t-22)", margin: 0 }}>故事</h1>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
            {world.name}
          </span>
        </div>

        <div className="row gap-2" style={{ marginBottom: 20 }}>
          <input
            ref={titleInputRef}
            className="input"
            placeholder="新故事标题"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (createError) setCreateError(null);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            aria-invalid={Boolean(createError)}
            aria-describedby={createError ? "story-create-error" : undefined}
            style={{ flex: 1 }}
          />
          <button className="btn primary" disabled={creating} onClick={() => void handleCreate()}>
            <Icon name="plus" size={13} />
            <span>{creating ? "创建中" : "创建故事"}</span>
          </button>
        </div>
        {createError ? (
          <div id="story-create-error" role="alert" style={{ color: "var(--brick)", fontSize: 12, margin: "-12px 0 20px" }}>
            {createError}
          </div>
        ) : null}

        {narrativesQuery.isPending ? (
          <div className="row gap-2" style={{ color: "var(--fg-3)", fontSize: 13 }}>
            <span className="dot amber pulse" />
            <span>正在载入故事</span>
          </div>
        ) : narratives.length === 0 ? (
          <div style={{ color: "var(--fg-3)", fontSize: 13, lineHeight: 1.6, textAlign: "center", padding: "40px 0" }}>
            还没有故事。在上面创建第一个。
          </div>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            {narratives.map((n: any) => (
              <a
                key={n.id}
                href={`/narratives/${n.id}`}
                style={{
                  display: "block",
                  padding: "14px 16px",
                  border: "1px solid var(--hairline)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--fg)",
                  textDecoration: "none",
                }}
              >
                <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: 15 }}>{n.title}</strong>
                  <span className="badge">{n.status}</span>
                </div>
                <div className="row gap-3" style={{ marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{n.chapterCount} 章</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{n.assetCount} 资产</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
