"use client";

import type { AgentSessionMessage } from "@worlddock/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionHistoryPanel } from "../../agent-sessions/session-history-panel";
import { PotentialAssetDrawer } from "../../agent-sessions/potential-asset-drawer";
import { SessionPage } from "../../agent-sessions/session-page";
import { OfficialAssetDetailPage } from "../../world-assets/official-asset-detail-page";
import { OfficialAssetLibraryPage } from "../../world-assets/official-asset-library-page";
import { officialAssetsQueryKeys } from "../../world-assets/use-official-assets";
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
import { cancelAgentRun, getOfficialAsset } from "../api";
import { Icon } from "../components";
import { getSuggestionKey } from "../suggestion-utils";
import { ArchiveView, ConflictsView } from "../view-archive";
import { PublishView } from "../view-publish";
import { SettingsView } from "../view-settings";
import { Composer, Message } from "../view-workbench";
import type { WorldDockView } from "./world-navigation";

export type WorldDockRuntimeState = {
  messages: any[];
  agentBusy: boolean;
  savedIds: any[];
  pendingItems: any[];
  savedSettings: any[];
  savedSeeds: any[];
  savedConflicts: any[];
  savedIssues: any[];
  allSavedAssets: any[];
};

export type WorldDockActions = {
  setMessages: any;
  startAgentRun: (text: string) => void;
  stopAgent: () => void;
  handleSave: (item: any) => void;
  setDrawerOpen: any;
  setView: (view: WorldDockView) => void;
  openAssetEditor: (kind: "setting" | "seed" | "conflict", asset?: any) => void;
  removeEditedAsset: (asset: any) => void;
  reorderAssets: (assetIds: string[]) => void;
  openAssetRelation: (asset: any) => void;
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
    savedIds,
    pendingItems,
    savedSettings,
    savedSeeds,
    savedConflicts,
    savedIssues,
    allSavedAssets,
  } = worldState;
  const {
    setMessages,
    startAgentRun,
    stopAgent,
    handleSave,
    setDrawerOpen,
    setView,
    openAssetEditor,
    removeEditedAsset,
    reorderAssets,
    openAssetRelation,
    pushToast,
  } = actions;

  return (
    <>
      {view === "exploration" && currentWorld && (
        <ExplorationWorkspace
          world={currentWorld}
          messages={messages}
          agentBusy={agentBusy}
          savedIds={savedIds}
          pendingCount={pendingItems.length}
          setMessages={setMessages}
          startAgentRun={startAgentRun}
          stopAgent={stopAgent}
          handleSave={handleSave}
          setDrawerOpen={setDrawerOpen}
          pushToast={pushToast}
        />
      )}
      {view === "asset-library" && currentWorld && (
        <AssetLibraryWorkspace
          world={currentWorld}
          savedSettings={savedSettings}
          savedSeeds={savedSeeds}
          savedConflicts={savedConflicts}
          savedIssues={savedIssues}
          setDrawerOpen={setDrawerOpen}
          setView={setView}
          openAssetEditor={openAssetEditor}
          removeEditedAsset={removeEditedAsset}
          reorderAssets={reorderAssets}
          openAssetRelation={openAssetRelation}
          pushToast={pushToast}
        />
      )}
      {view === "consistency" && currentWorld && (
        <ConflictsView world={currentWorld} savedConflicts={savedConflicts} savedSeeds={savedSeeds}
          onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
          onCreateAsset={openAssetEditor}
          onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
          onDeleteAsset={removeEditedAsset}
          onReorderAssets={reorderAssets}
          onRelateAssets={openAssetRelation}
          onBackToWorkbench={() => setView("exploration")}/>
      )}
      {view === "publish" && currentWorld && (
        <PublishView
          currentWorld={currentWorld}
          assets={allSavedAssets}
          onToast={pushToast}
          onBack={() => setView("exploration")}
        />
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
  savedIds,
  pendingCount,
  setMessages,
  startAgentRun,
  stopAgent,
  handleSave,
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
      savedIds={savedIds}
      pendingCount={pendingCount}
      setMessages={setMessages}
      startAgentRun={startAgentRun}
      stopAgent={stopAgent}
      handleSave={handleSave}
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
          if (event.type === "message.delta") {
            setOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${event.payload.text}` }
                : message,
            ));
          }
          if (event.type === "potential_asset.detected") {
            void queryClient.invalidateQueries({
              queryKey: agentSessionKeys.potentialAssetsForSession(world.id, sessionId),
            });
          }
          if (event.type === "run.completed") {
            terminalStatus = "completed";
            activeSessionRunIdRef.current = null;
            setRunState("completed");
            setTokens(event.payload.tokenUsage?.totalTokens ?? 0);
            setOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "complete" }
                : message,
            ));
          }
          if (event.type === "run.failed") {
            terminalStatus = "failed";
            activeSessionRunIdRef.current = null;
            setRunState("failed");
            setOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: message.content || event.payload.message || "推演失败" }
                : message,
            ));
          }
          if (event.type === "run.cancelled") {
            terminalStatus = "failed";
            activeSessionRunIdRef.current = null;
            setRunState("failed");
            setOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: `${message.content || "推演已取消"}` }
                : message,
            ));
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
          ? { ...message, status: "failed", content: message.content || "Agent 调用失败" }
          : message,
      ));
    }
  }, [cancelActiveSessionRun, createRun, queryClient, runState, sessionId, streamRun, world]);

  const handleSessionStop = useCallback(() => {
    cancelActiveSessionRun();
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState("failed");
    setOptimisticMessages((prev) => prev.map((message) =>
      message.status === "streaming"
        ? { ...message, status: "failed", content: `${message.content || "推演已停止"}` }
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
        rightSlot={(
          <SessionHistoryPanel
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

const LegacyExplorationWorkspace = ({
  world,
  messages,
  agentBusy,
  savedIds,
  pendingCount,
  setMessages,
  startAgentRun,
  stopAgent,
  handleSave,
  setDrawerOpen,
}: any) => (
  <Workbench
    world={world}
    messages={messages}
    agentBusy={agentBusy}
    savedIds={savedIds}
    pendingCount={pendingCount}
    contextRefs={getLatestCompletedContextRefs(messages)}
    onSend={(text: string) => {
      setMessages((prev: any[]) => [...prev, { id: "u_" + Date.now(), role: "user", text }]);
      setTimeout(() => startAgentRun(text), 200);
    }}
    onStop={stopAgent}
    onSave={handleSave}
    onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s })}
    onOpenContext={(snapshot?: any) => setDrawerOpen({ kind: "context", snapshot })}
    onOpenSuggestions={() => setDrawerOpen({ kind: "pending" })}
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

const AssetLibraryWorkspace = ({
  world,
  savedSettings,
  savedIssues,
  setDrawerOpen,
  setView,
  openAssetEditor,
  removeEditedAsset,
  reorderAssets,
  openAssetRelation,
  pushToast,
}: any) => {
  const [officialAssetsUnavailable, setOfficialAssetsUnavailable] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const assetDetailQuery = useQuery({
    queryKey: officialAssetsQueryKeys.detail(world?.id, selectedAssetId),
    queryFn: () => {
      if (!world?.id || !selectedAssetId) throw new Error("World id and asset id are required.");
      return getOfficialAsset(world.id, selectedAssetId);
    },
    enabled: Boolean(world?.id && selectedAssetId && !officialAssetsUnavailable),
    retry: false,
  });

  useEffect(() => {
    setOfficialAssetsUnavailable(false);
    setSelectedAssetId(null);
  }, [world?.id]);

  if (officialAssetsUnavailable) {
    return (
      <ArchiveView world={world} savedSettings={savedSettings} savedIssues={savedIssues}
        onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
        onOpenIssues={(focusEntryId: any) => setDrawerOpen({ kind: "issues", focusEntryId })}
        onCreateAsset={openAssetEditor}
        onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
        onDeleteAsset={removeEditedAsset}
        onReorderAssets={reorderAssets}
        onRelateAssets={openAssetRelation}
        onBackToWorkbench={() => setView("exploration")}/>
    );
  }

  if (selectedAssetId) {
    return (
      <OfficialAssetDetailPage
        detail={assetDetailQuery.data ?? null}
        error={assetDetailQuery.error}
        loading={assetDetailQuery.isLoading}
        onBack={() => setSelectedAssetId(null)}
        onRefresh={() => {
          void assetDetailQuery.refetch();
        }}
        onStartEdit={() => {
          pushToast?.({ kind: "warn", text: "编辑会话将在后续任务接入" });
        }}
        patches={[]}
      />
    );
  }

  return (
    <OfficialAssetLibraryPage
      world={world}
      onLoadError={() => setOfficialAssetsUnavailable(true)}
      onOpenAsset={(assetId: string) => setSelectedAssetId(assetId)}
    />
  );
};

const Workbench = ({
  world, messages, agentBusy, savedIds, pendingCount,
  onSend, onStop, onSave, onOpenDetail,
  onOpenContext, onOpenSuggestions, contextRefs,
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
              <Message key={m.id} msg={m} savedIds={getMessageSavedSuggestionIds(m, savedIds)}
                onSave={onSave}
                onOpenDetail={onOpenDetail}
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
        pendingCount={pendingCount}
        contextRefs={contextRefs}
        onOpenSuggestions={onOpenSuggestions}
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

function getMessageSavedSuggestionIds(message: any, savedSuggestionKeys: any[]) {
  if (!message.suggestions) return [];
  return message.suggestions
    .filter((suggestion: any) => savedSuggestionKeys.includes(getSuggestionKey(suggestion)))
    .map((suggestion: any) => getSuggestionKey(suggestion));
}
