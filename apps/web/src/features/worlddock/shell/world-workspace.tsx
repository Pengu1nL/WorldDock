"use client";

import type { AgentSessionMessage } from "@worlddock/contract";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionPage } from "../../agent-sessions/session-page";
import {
  agentSessionKeys,
  agentSessionsFeatureEnabled,
  isAgentSessionNotFoundError,
  useCreateSessionRun,
  useCurrentExplorationSession,
  useStreamSessionRun,
} from "../../agent-sessions/use-agent-session";
import { Icon } from "../components";
import { getSuggestionKey } from "../suggestion-utils";
import { ArchiveView, ConflictsView, SeedsView } from "../view-archive";
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
}: any) => {
  const sessionsEnabled = agentSessionsFeatureEnabled();
  const sessionQuery = useCurrentExplorationSession(sessionsEnabled ? world : null);
  const sessionDetail = sessionQuery.data;
  const sessionId = sessionDetail?.session.id;
  const queryClient = useQueryClient();
  const createRun = useCreateSessionRun(world?.id, sessionId);
  const streamRun = useStreamSessionRun(null);
  const abortRef = useRef<AbortController | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<AgentSessionMessage[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [tokens, setTokens] = useState(0);
  const [forceLegacyFallback, setForceLegacyFallback] = useState(false);

  useEffect(() => {
    setOptimisticMessages([]);
    setRunState("idle");
    setTokens(0);
    setForceLegacyFallback(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [sessionId]);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

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
      if (abortRef.current !== abortController) return;

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
          if (event.type === "run.completed") {
            terminalStatus = "completed";
            setRunState("completed");
            setTokens(event.payload.tokenUsage?.totalTokens ?? 0);
          }
          if (event.type === "run.failed") {
            terminalStatus = "failed";
            setRunState("failed");
            setOptimisticMessages((prev) => prev.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, status: "failed", content: message.content || event.payload.message || "推演失败" }
                : message,
            ));
          }
          if (event.type === "run.cancelled") {
            terminalStatus = "failed";
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
      ]);
    } catch (error) {
      if (isAbortError(error)) return;
      if (isAgentSessionNotFoundError(error)) {
        abortRef.current?.abort();
        abortRef.current = null;
        setOptimisticMessages([]);
        setRunState("idle");
        setTokens(0);
        setForceLegacyFallback(true);
        return;
      }
      abortRef.current = null;
      setRunState("failed");
      setOptimisticMessages((prev) => prev.map((message) =>
        message.id === assistantMessage.id
          ? { ...message, status: "failed", content: message.content || "Agent 调用失败" }
          : message,
      ));
    }
  }, [createRun, queryClient, runState, sessionId, streamRun, world]);

  const handleSessionStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState("failed");
    setOptimisticMessages((prev) => prev.map((message) =>
      message.status === "streaming"
        ? { ...message, status: "failed", content: `${message.content || "推演已停止"}` }
        : message,
    ));
  }, []);

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
    <SessionPage
      session={sessionDetail.session}
      subjects={sessionDetail.subjects}
      messages={[...sessionDetail.messages, ...optimisticMessages]}
      contextItems={sessionDetail.contextItems}
      runState={{ status: runState, tokens }}
      onSend={handleSessionSend}
      onStop={handleSessionStop}
    />
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

const AssetLibraryWorkspace = ({
  world,
  savedSettings,
  savedSeeds,
  savedConflicts,
  savedIssues,
  setDrawerOpen,
  setView,
  openAssetEditor,
  removeEditedAsset,
  reorderAssets,
  openAssetRelation,
}: any) => {
  const [assetView, setAssetView] = useState<"archive" | "seeds">("archive");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{
        padding: "10px 32px",
        borderBottom: "1px solid var(--hairline)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}>
        <button
          className={"sb-btn " + (assetView === "archive" ? "primary" : "")}
          onClick={() => setAssetView("archive")}
          style={{ height: 26, fontSize: 12 }}
          type="button"
        >
          设定 <span className="mono sb-dim">{savedSettings.length}</span>
        </button>
        <button
          className={"sb-btn " + (assetView === "seeds" ? "primary" : "")}
          onClick={() => setAssetView("seeds")}
          style={{ height: 26, fontSize: 12 }}
          type="button"
        >
          种子 <span className="mono sb-dim">{savedSeeds.length}</span>
        </button>
      </div>
      {assetView === "archive" ? (
        <ArchiveView world={world} savedSettings={savedSettings} savedIssues={savedIssues}
          onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
          onOpenIssues={(focusEntryId: any) => setDrawerOpen({ kind: "issues", focusEntryId })}
          onCreateAsset={openAssetEditor}
          onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
          onDeleteAsset={removeEditedAsset}
          onReorderAssets={reorderAssets}
          onRelateAssets={openAssetRelation}
          onBackToWorkbench={() => setView("exploration")}/>
      ) : (
        <SeedsView world={world} savedSeeds={savedSeeds} savedConflicts={savedConflicts}
          onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
          onJumpToConflict={(c: any) => {
            setDrawerOpen(null);
            setView("consistency");
            setTimeout(() => setDrawerOpen({ kind: "detail", item: c, readonly: true }), 50);
          }}
          onCreateAsset={openAssetEditor}
          onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
          onDeleteAsset={removeEditedAsset}
          onReorderAssets={reorderAssets}
          onRelateAssets={openAssetRelation}
          onBackToWorkbench={() => setView("exploration")}/>
      )}
    </div>
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
