"use client";

// world-dock-app.tsx — Main app shell, routing, real agent runtime

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  cancelAgentRun,
  createAgentRun,
  createWorld as createWorldRequest,
  createWorldAsset,
  deleteWorld as deleteCloudWorld,
  discardAgentSuggestion,
  duplicateWorld as duplicateCloudWorld,
  getBillingBalance,
  listArchiveEntries,
  listConflicts,
  listStorySeeds,
  listWorlds,
  publishWorld,
  readStoredSessionToken,
  saveAgentSuggestion,
  streamAgentEvents,
  WorldDockApiError,
  type CreateWorldInput,
} from "./api";
import { Drawer, Icon, Rail, StatusBar, Toasts } from "./components";
import { CommunityView } from "./view-community";
import {
  TweakRadio,
  TweakSection,
  TweaksPanel,
  useTweaks,
} from "./tweaks-panel";
import { ArchiveView, ConflictsView, SeedsView } from "./view-archive";
import {
  Composer,
  ContextDrawer,
  IssuesDrawer,
  Message,
  PendingDrawer,
  SuggestionDetail,
} from "./view-workbench";
import { PublishView } from "./view-publish";
import { SettingsView } from "./view-settings";
import { CreateView, WorldsView } from "./view-worlds";

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mode": "cloud",
  "density": "regular",
  "titleFont": "serif",
  "appTheme": "light"
}/*EDITMODE-END*/;

const worldDockQueryClient = new QueryClient();

export function WorldDockApp() {
  return (
    <QueryClientProvider client={worldDockQueryClient}>
      <WorldDockRuntime />
    </QueryClientProvider>
  );
}

function WorldDockRuntime() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply density / font tweaks
  useEffect(() => { document.documentElement.dataset.density = t.density; }, [t.density]);
  useEffect(() => { document.documentElement.dataset.titleFont = t.titleFont; }, [t.titleFont]);
  useEffect(() => { document.documentElement.dataset.appTheme = t.appTheme; }, [t.appTheme]);

  // ────────── App state ──────────
  const [view, setView] = useState<any>("worlds");  // worlds | create | workbench | archive | seeds | conflicts | publish | explore | settings
  const [currentWorld, setCurrentWorld] = useState<any>(null);
  const [worlds, setWorlds] = useState<any[]>([]);
  const [createInspiration, setCreateInspiration] = useState("");
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<any>(null);

  // Workbench state — per current world (live copies for the open world; archived in worldStatesRef)
  const [messages, setMessages] = useState<any[]>([]);
  const [agentMode, setAgentMode] = useState("expand");
  const [agentBusy, setAgentBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<any>(null);  // { kind: 'detail'|'context'|'pending', item, readonly? }
  const [savedSettings, setSavedSettings] = useState<any[]>([]);
  const [savedSeeds, setSavedSeeds] = useState<any[]>([]);
  const [savedConflicts, setSavedConflicts] = useState<any[]>([]);
  const [savedIssues, setSavedIssues] = useState<any[]>([]);   // 一致性问题（待修矛盾）
  const [savedIds, setSavedIds] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [runTokens, setRunTokens] = useState(0);
  const [modeFlash, setModeFlash] = useState<any>(null);  // flash banner when agent mode changes mid-thread
  const [communityConnected, setCommunityConnected] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);

  const agentAbortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  // worldId → { messages, savedSettings, savedSeeds, savedConflicts, savedIds, agentMode }
  const worldStatesRef = useRef<any>({});

  useEffect(() => {
    setSessionToken(readStoredSessionToken());
  }, []);

  const worldsQuery = useQuery({
    queryKey: ["worlds", sessionToken],
    queryFn: async () => listWorlds({ sessionToken }) as Promise<{ worlds: any[] }>,
    enabled: Boolean(sessionToken),
    retry: false,
  });

  useEffect(() => {
    if (worldsQuery.data?.worlds) setWorlds(worldsQuery.data.worlds);
  }, [worldsQuery.data]);

  useEffect(() => {
    if (!sessionToken) return;
    if (worldsQuery.isPending || worldsQuery.isError) setWorlds([]);
  }, [sessionToken, worldsQuery.isError, worldsQuery.isPending]);

  const cloudWorldsState = sessionToken
    ? worldsQuery.isPending
      ? "loading"
      : worldsQuery.isError
        ? "error"
        : "ready"
    : "ready";

  const archiveQuery = useQuery({
    queryKey: ["archive", sessionToken, currentWorld?.id],
    queryFn: async () => listArchiveEntries(currentWorld.id, { sessionToken }) as Promise<{ archiveEntries: any[] }>,
    enabled: Boolean(sessionToken && currentWorld?.id),
    retry: false,
  });
  const seedsQuery = useQuery({
    queryKey: ["seeds", sessionToken, currentWorld?.id],
    queryFn: async () => listStorySeeds(currentWorld.id, { sessionToken }) as Promise<{ storySeeds: any[] }>,
    enabled: Boolean(sessionToken && currentWorld?.id),
    retry: false,
  });
  const conflictsQuery = useQuery({
    queryKey: ["conflicts", sessionToken, currentWorld?.id],
    queryFn: async () => listConflicts(currentWorld.id, { sessionToken }) as Promise<{ conflicts: any[] }>,
    enabled: Boolean(sessionToken && currentWorld?.id),
    retry: false,
  });

  useEffect(() => {
    if (!archiveQuery.data?.archiveEntries) return;
    setSavedSettings(archiveQuery.data.archiveEntries.map((entry: any) => ({ ...entry, kind: "setting" })));
  }, [archiveQuery.data]);

  useEffect(() => {
    if (!seedsQuery.data?.storySeeds) return;
    setSavedSeeds(seedsQuery.data.storySeeds.map((seed: any) => ({ ...seed, kind: "seed", questions: seed.questions || [] })));
  }, [seedsQuery.data]);

  useEffect(() => {
    if (!conflictsQuery.data?.conflicts) return;
    setSavedConflicts(conflictsQuery.data.conflicts.map((conflict: any) => ({ ...conflict, kind: "conflict" })));
  }, [conflictsQuery.data]);

  useEffect(() => {
    if (!currentWorld || !sessionToken) return;
    const nextCounts = {
      archive: archiveQuery.data?.archiveEntries?.length ?? currentWorld.archive,
      seeds: seedsQuery.data?.storySeeds?.length ?? currentWorld.seeds,
      conflicts: conflictsQuery.data?.conflicts?.length ?? currentWorld.conflicts,
    };
    if (
      currentWorld.archive === nextCounts.archive &&
      currentWorld.seeds === nextCounts.seeds &&
      currentWorld.conflicts === nextCounts.conflicts
    ) {
      return;
    }
    const nextWorld = { ...currentWorld, ...nextCounts };
    setCurrentWorld(nextWorld);
    setWorlds((prev: any[]) => prev.map((world: any) => world.id === nextWorld.id ? nextWorld : world));
  }, [archiveQuery.data, conflictsQuery.data, currentWorld, seedsQuery.data, sessionToken]);

  // Persist current world's workbench state whenever it changes
  useEffect(() => {
    if (!currentWorld) return;
    worldStatesRef.current[currentWorld.id] = {
      messages, savedSettings, savedSeeds, savedConflicts, savedIssues, savedIds, agentMode,
    };
  }, [currentWorld, messages, savedSettings, savedSeeds, savedConflicts, savedIssues, savedIds, agentMode]);

  const pushToast = useCallback((toast: any) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev: any[]) => [...prev, { id, ...toast }]);
    setTimeout(() => setToasts((prev: any[]) => prev.filter((x: any) => x.id !== id)), toast.timeout || 3000);
  }, []);

  const startAgentRun = useCallback(async (userText: string, targetWorld = currentWorld) => {
    if (agentBusy) return;
    if (!sessionToken || !targetWorld?.id) {
      pushToast({ kind: "warn", text: "请先登录并打开一个真实世界" });
      return;
    }
    setAgentBusy(true);
    setRunTokens(0);

    const agentMsg = {
      id: "m_" + Date.now(),
      role: "agent",
      mode: agentMode,
      text: "",
      tools: null,
      suggestions: null,
      streaming: true,
      contextRefs: null,
    };
    setMessages(prev => [...prev, agentMsg]);

    try {
      const abortController = new AbortController();
      agentAbortRef.current = abortController;
      const created: any = await createAgentRun(
        targetWorld.id,
        { prompt: userText, mode: getBackendAgentMode(agentMode) },
        { sessionToken },
      );
      setActiveAgentRunId(created.run.id);
      let currentText = "";
      let contextRefs = 0;
      const suggestions: any[] = [];

      await streamAgentEvents(created.run.id, { sessionToken, signal: abortController.signal }, (event) => {
        if (event.type === "message.delta") {
          currentText += event.payload.text;
          setMessages((prev: any[]) => prev.map((m: any) => m.id === agentMsg.id ? { ...m, text: currentText } : m));
          setRunTokens((tk: number) => tk + Math.max(1, Math.ceil(event.payload.text.length / 2)));
        }
        if (event.type === "context.used") contextRefs++;
        if (event.type === "suggestion.created") {
          suggestions.push({ ...event.payload.suggestion, agentSuggestionId: event.payload.suggestionId });
        }
        if (event.type === "run.completed" && event.payload.tokenUsage) {
          setRunTokens(event.payload.tokenUsage.totalTokens);
        }
        if (event.type === "run.failed") {
          pushToast({ kind: "warn", text: event.payload.message || "模型不可用" });
        }
      });

      setMessages((prev: any[]) => prev.map((m: any) => m.id === agentMsg.id
        ? { ...m, streaming: false, suggestions, contextRefs }
        : m));
      try {
        const billing = await getBillingBalance({ sessionToken });
        setBalance(billing.balance.balanceCents / 100);
      } catch {
        pushToast({ kind: "info", text: "Agent 已完成，用量稍后同步" });
      }
      if (agentAbortRef.current === abortController) agentAbortRef.current = null;
      setAgentBusy(false);
      setActiveAgentRunId(null);
    } catch (error) {
      if (isAbortError(error)) return;
      agentAbortRef.current = null;
      setMessages((prev: any[]) => prev.filter((m: any) => m.id !== agentMsg.id));
      setAgentBusy(false);
      setActiveAgentRunId(null);
      if (error instanceof WorldDockApiError && error.code === "INSUFFICIENT_BALANCE") {
        pushToast({ kind: "warn", text: "余额不足 · 请充值后继续推演" });
        return;
      }
      pushToast({ kind: "warn", text: "Agent 调用失败 · 请检查后端、Provider 和 API Key" });
    }
  }, [agentBusy, agentMode, currentWorld, pushToast, sessionToken]);

  const stopAgent = useCallback(() => {
    if (activeAgentRunId && sessionToken) {
      void cancelAgentRun(activeAgentRunId, { sessionToken });
      setActiveAgentRunId(null);
    }
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;
    setAgentBusy(false);
    setMessages((prev: any[]) => prev.map((m: any) => m.streaming ? { ...m, streaming: false, text: m.text + " [已停止]" } : m));
  }, [activeAgentRunId, sessionToken]);

  // ────────── Navigation handlers ──────────
  const openWorld = (id: string) => {
    const w = worlds.find((world: any) => world.id === id);
    if (!w) return;
    setCurrentWorld(w);
    setView("workbench");
    // Restore prior state if we have it
    const saved = worldStatesRef.current[id];
    if (saved) {
      setMessages(saved.messages || []);
      setSavedSettings(saved.savedSettings || []);
      setSavedSeeds(saved.savedSeeds || []);
      setSavedConflicts(saved.savedConflicts || []);
      setSavedIssues(saved.savedIssues || []);
      setSavedIds(saved.savedIds || []);
      setAgentMode(saved.agentMode || "expand");
    } else {
      setMessages([]);
      setSavedSettings([]);
      setSavedSeeds([]);
      setSavedConflicts([]);
      setSavedIssues([]);
      setSavedIds([]);
      setAgentMode("expand");
    }
    setRunTokens(0);
  };

  const continueDraft = () => {
    if (!recentlyCreatedId) return;
    openWorld(recentlyCreatedId);
  };

  const deleteWorld = async (id: string) => {
    if (sessionToken && isCloudPersistedWorldId(id)) {
      try {
        await deleteCloudWorld(id, { sessionToken });
      } catch {
        pushToast({ kind: "warn", text: "云端删除失败 · 请稍后重试" });
        return;
      }
    }
    setWorlds((prev: any[]) => prev.filter((w: any) => w.id !== id));
    delete worldStatesRef.current[id];
    if (recentlyCreatedId === id) setRecentlyCreatedId(null);
    if (currentWorld?.id === id) { setCurrentWorld(null); setView("worlds"); }
    pushToast({ kind: "warn", text: "已删除世界" });
  };

  const duplicateWorld = async (id: string) => {
    const w = worlds.find((world: any) => world.id === id);
    if (!w) return;
    if (sessionToken && isCloudPersistedWorldId(id)) {
      try {
        const created: any = await duplicateCloudWorld(id, { sessionToken });
        setWorlds((prev: any[]) => [created.world, ...prev.filter((world: any) => world.id !== created.world.id)]);
        pushToast({ kind: "save", text: `已复制 · ${created.world.name}` });
        return;
      } catch {
        pushToast({ kind: "warn", text: "云端复制失败 · 请稍后重试" });
        return;
      }
    }
    const copy = { ...w, id: "copy_" + Date.now(), name: w.name + " · 副本", status: "draft", updated: "刚刚", isNew: true };
    setWorlds((prev: any[]) => [copy, ...prev]);
    // Copy workbench state too
    if (worldStatesRef.current[id]) {
      worldStatesRef.current[copy.id] = JSON.parse(JSON.stringify(worldStatesRef.current[id]));
    }
    pushToast({ kind: "save", text: `已复制 · ${copy.name}` });
  };

  const handleCreateWorld = async ({ name, type, inspiration, styleKw, avoid }: any) => {
    if (!sessionToken) {
      pushToast({ kind: "warn", text: "请先登录，再创建真实世界" });
      return;
    }

    try {
      const created: any = await createWorldRequest(
        buildCreateWorldInput({ name, type, inspiration, styleKw, avoid, mode: t.mode }),
        { sessionToken },
      );
      const newWorld = created.world;
      setWorlds((prev: any[]) => [newWorld, ...prev.filter((world: any) => world.id !== newWorld.id)]);
      setCurrentWorld(newWorld);
      setRecentlyCreatedId(newWorld.id);
      setMessages([{ id: "u0", role: "user", text: inspiration }]);
      setSavedSettings([]);
      setSavedSeeds([]);
      setSavedConflicts([]);
      setSavedIssues([]);
      setSavedIds([]);
      setView("workbench");
      setTimeout(() => startAgentRun(inspiration, newWorld), 200);
    } catch {
      pushToast({ kind: "warn", text: "创建世界失败 · 请检查登录状态和 API 服务" });
    }
  };

  // Save suggestion handler
  const handleSave = async (item: any) => {
    if (savedIds.includes(item.id)) return;
    if (sessionToken && item.agentSuggestionId) {
      try {
        await saveAgentSuggestion(item.agentSuggestionId, { sessionToken });
      } catch {
        pushToast({ kind: "warn", text: "云端保存失败 · 请检查网络后重试" });
        return;
      }
    } else if (sessionToken && currentWorld?.id && isCloudPersistedWorldId(currentWorld.id)) {
      try {
        await createWorldAsset(currentWorld.id, toWorldAssetInput(item), { sessionToken });
      } catch {
        pushToast({ kind: "warn", text: "云端资产保存失败 · 请检查网络后重试" });
        return;
      }
    }
    setSavedIds((prev: any[]) => [...prev, item.id]);
    if (item.kind === "setting") {
      setSavedSettings((prev: any[]) => [...prev, item]);
      pushToast({ kind: "save", text: `已保存到档案 · ${item.title}`, action: { label: "查看", onClick: () => setView("archive") } });
    } else if (item.kind === "seed") {
      setSavedSeeds((prev: any[]) => [...prev, item]);
      pushToast({ kind: "save", text: `已保存到种子池 · ${item.title}`, action: { label: "查看", onClick: () => setView("seeds") } });
    } else if (item.kind === "conflict") {
      setSavedConflicts((prev: any[]) => [...prev, item]);
      pushToast({ kind: "save", text: `已记入冲突池 · ${item.title}` });
    }
    // Update current world counters
    if (currentWorld) {
      setCurrentWorld((prev: any) => ({
        ...prev,
        archive: item.kind === "setting" ? prev.archive + 1 : prev.archive,
        seeds:   item.kind === "seed"    ? prev.seeds + 1   : prev.seeds,
        conflicts: item.kind === "conflict" ? prev.conflicts + 1 : prev.conflicts,
        maturity: Math.min(100, prev.maturity + (item.kind === "setting" ? 6 : 3)),
        hasUnsaved: false,
      }));
    }
    // Auto-close drawer
    setDrawerOpen(null);
  };

  const handleDiscard = async (item: any) => {
    if (sessionToken && item.agentSuggestionId) {
      try {
        await discardAgentSuggestion(item.agentSuggestionId, { sessionToken });
      } catch {
        pushToast({ kind: "warn", text: "云端丢弃失败 · 请检查网络后重试" });
        return;
      }
    }
    setSavedIds((prev: any[]) => [...prev, item.id]);
    pushToast({ kind: "warn", text: `已丢弃 · ${item.title}` });
    setDrawerOpen(null);
  };

  // ────────── Issue triage (一致性问题) ──────────
  // 一条 issue 进入三选一：
  //   - 修：用户在 Archive 里去改对应设定，issue 标记为已解决
  //   - 留为冲突：issue 升格为冲突池里的「戏剧张力」
  //   - 弃：直接关闭，不再提示
  const handleResolveIssue = (issue: any) => {
    setSavedIssues((prev: any[]) => prev.filter((x: any) => x.id !== issue.id));
    pushToast({ kind: "save", text: `已标记为修复 · ${issue.title}` });
  };

  const handlePromoteIssueToConflict = (issue: any) => {
    setSavedIssues((prev: any[]) => prev.filter((x: any) => x.id !== issue.id));
    // Resolve involved setting IDs → titles for the relations field
    const involvedTitles = (issue.involves || [])
      .map((id: any) => savedSettings.find((s: any) => s.id === id))
      .filter(Boolean)
      .map((s: any) => s.title);
    const newConflict = {
      id: "promoted_" + issue.id + "_" + Date.now(),
      kind: "conflict",
      category: "戏剧张力 · 升格自一致性问题",
      title: issue.title,
      summary: issue.description,
      body: issue.description + "\n\n（来自一致性问题：作者选择保留为戏剧引擎，不修。）",
      related: involvedTitles,
      derivedSeeds: [],
    };
    setSavedConflicts((prev: any[]) => [...prev, newConflict]);
    pushToast({
      kind: "save",
      text: `已升格为冲突 · ${issue.title}`,
      action: { label: "查看", onClick: () => setView("conflicts") },
    });
  };

  const handleDiscardIssue = (issue: any) => {
    setSavedIssues((prev: any[]) => prev.filter((x: any) => x.id !== issue.id));
    pushToast({ kind: "warn", text: `已忽略 · ${issue.title}` });
  };

  // Pending items in current message stream
  const allSuggestions = useMemo(() => {
    const set = new Map<string, any>();
    for (const m of messages) {
      if (m.suggestions) for (const s of m.suggestions) set.set(s.id, s);
    }
    return [...set.values()];
  }, [messages]);
  const pendingItems = useMemo(() => allSuggestions.filter((s: any) => !savedIds.includes(s.id)), [allSuggestions, savedIds]);

  // ────────── Top-level render ──────────
  return (
    <div className="app">
      <StatusBar
        world={currentWorld && view !== "worlds" && view !== "create" && view !== "explore" ? currentWorld : null}
        mode={t.mode}
        balance={balance}
        tokens={runTokens}
        onMode={(m: any) => setTweak("mode", m)}
        onOpenPublish={() => {
          if (currentWorld) setView("publish");
          else pushToast({ text: "请先打开一个世界", kind: "warn" });
        }}
        onOpenCommunity={() => setView("explore")}
      />
      <div className="app-body">
        <Rail
          view={view}
          onNav={(v: any) => {
            if (v === "explore") setView("explore");
            else if (v === "worlds") setView("worlds");
            else if (v === "settings") setView("settings");
            else if (currentWorld) setView(v);
            else setView("worlds");
          }}
          world={currentWorld && view !== "worlds" && view !== "create" && view !== "explore" ? currentWorld : null}
          pendingCount={pendingItems.length}
        />
        <main className="app-main" ref={mainRef} style={{ position: "relative", overflow: "hidden" }}>
          {view === "worlds" && (() => {
            const draftWorld = recentlyCreatedId ? worlds.find((w: any) => w.id === recentlyCreatedId) : null;
            // Show as "savedDraft" hero card only while the world is still fresh (zero saves)
            const draftState = draftWorld ? worldStatesRef.current[draftWorld.id] : null;
            const isStillFresh = draftWorld && (!draftState || ((draftState.savedSettings?.length || 0) + (draftState.savedSeeds?.length || 0) + (draftState.savedConflicts?.length || 0) === 0));
            return (
              <WorldsView worlds={worlds} onOpen={openWorld}
                onCreate={(inspiration: any) => { setCreateInspiration(inspiration || ""); setView("create"); }}
                savedDraft={isStillFresh ? { name: draftWorld.name, coreSetting: draftWorld.summary, id: draftWorld.id } : null}
                onContinueDraft={continueDraft}
                onDelete={deleteWorld}
                onDuplicate={duplicateWorld}
                hideDraftFromList={isStillFresh ? draftWorld.id : null}
                cloudState={cloudWorldsState}
                cloudOnly={Boolean(sessionToken)}
              />
            );
          })()}
          {view === "create" && (
            <CreateView initialInspiration={createInspiration}
              onConfirm={handleCreateWorld} onCancel={() => setView("worlds")}/>
          )}
          {view === "workbench" && currentWorld && (
            <Workbench
              world={currentWorld}
              messages={messages}
              agentMode={agentMode}
              agentBusy={agentBusy}
              savedIds={savedIds}
              pendingCount={pendingItems.length}
              onModeChange={(m: any) => {
                if (m !== agentMode) {
                  setAgentMode(m);
                  setModeFlash(m);
                  setTimeout(() => setModeFlash((cur: any) => cur === m ? null : cur), 1600);
                }
              }}
              modeFlash={modeFlash}
              contextRefs={(() => {
                // Last completed agent message's contextRefs
                for (let i = messages.length - 1; i >= 0; i--) {
                  const m: any = messages[i];
                  if (m.role === "agent" && !m.streaming && m.contextRefs) return m.contextRefs;
                }
                return 0;
              })()}
              onSend={(text: string) => {
                setMessages((prev: any[]) => [...prev, { id: "u_" + Date.now(), role: "user", text }]);
                setTimeout(() => startAgentRun(text), 200);
              }}
              onStop={stopAgent}
              onSave={handleSave}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s })}
              onOpenContext={() => setDrawerOpen({ kind: "context" })}
              onOpenSuggestions={() => setDrawerOpen({ kind: "pending" })}
            />
          )}
          {view === "archive" && currentWorld && (
            <ArchiveView world={currentWorld} savedSettings={savedSettings} savedIssues={savedIssues}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onOpenIssues={(focusEntryId: any) => setDrawerOpen({ kind: "issues", focusEntryId })}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "seeds" && currentWorld && (
            <SeedsView world={currentWorld} savedSeeds={savedSeeds} savedConflicts={savedConflicts}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onJumpToConflict={(c: any) => { setDrawerOpen(null); setView("conflicts"); setTimeout(() => setDrawerOpen({ kind: "detail", item: c, readonly: true }), 50); }}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "conflicts" && currentWorld && (
            <ConflictsView world={currentWorld} savedConflicts={savedConflicts} savedSeeds={savedSeeds}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "publish" && currentWorld && (
            <PublishView
              mode={t.mode}
              world={currentWorld}
              communityConnected={communityConnected}
              onBack={() => setView("workbench")}
              onConfirm={async ({ releaseNote, license }: any) => {
                if (!sessionToken || !currentWorld?.id) {
                  pushToast({ kind: "warn", text: "请先登录并打开一个真实世界" });
                  return;
                }
                try {
                  await publishWorld(currentWorld.id, { releaseNote, license }, { sessionToken });
                } catch {
                  pushToast({ kind: "warn", text: "发布失败 · 请检查 API 服务和权限" });
                  return;
                }
                setCurrentWorld((prev: any) => prev
                  ? { ...prev, status: "published", visibility: "public", hasUnpushed: false, hasUnsaved: false }
                  : prev);
                setWorlds((prev: any[]) => prev.map((world: any) =>
                  world.id === currentWorld.id
                    ? { ...world, status: "published", visibility: "public", hasUnpushed: false, hasUnsaved: false }
                    : world,
                ));
                pushToast({
                  kind: "save",
                  text: `${t.mode === "local" ? "Push" : "发布"}成功 · ${releaseNote.slice(0, 18)}`,
                  action: { label: "查看界仓", onClick: () => setView("explore") },
                });
                setView("workbench");
              }}
            />
          )}
          {view === "explore" && (
            <CommunityView
              onBack={() => setView("worlds")}
              onToast={pushToast}
              onFork={(world: any) => {
                setWorlds((prev: any[]) => [world, ...prev.filter((item: any) => item.id !== world.id)]);
                setCurrentWorld(world);
                setView("worlds");
              }}
            />
          )}
          {view === "settings" && (
            <SettingsView
              mode={t.mode}
              balance={balance}
              communityConnected={communityConnected}
              onBack={() => setView("worlds")}
              onToast={pushToast}
              onCommunityConnected={setCommunityConnected}
              currentWorld={currentWorld}
            />
          )}

          {/* Drawer */}
          <Drawer
            open={!!drawerOpen}
            onClose={() => setDrawerOpen(null)}
            width={drawerOpen?.kind === "issues" ? 520 : undefined}
            title={
              drawerOpen?.kind === "detail" ? "编辑并确认" :
              drawerOpen?.kind === "context" ? "本轮上下文" :
              drawerOpen?.kind === "pending" ? `待处理建议 · ${pendingItems.length}` :
              drawerOpen?.kind === "issues" ? `一致性问题 · ${savedIssues.length}` : ""
            }
            subtitle={
              drawerOpen?.kind === "detail" ? "确认后会成为世界资产" :
              drawerOpen?.kind === "context" ? "Agent 本轮使用了哪些已确认资料" :
              drawerOpen?.kind === "pending" ? "保存有价值的，丢弃无关的" :
              drawerOpen?.kind === "issues" ? "Agent 发现的待修矛盾 · 三选一：修 / 留为冲突 / 弃" : ""
            }
          >
            {drawerOpen?.kind === "detail" && drawerOpen.item && (
              <SuggestionDetail
                item={drawerOpen.item}
                readonly={!!drawerOpen.readonly}
                allSavedSeeds={savedSeeds}
                allSavedConflicts={savedConflicts}
                onSave={handleSave}
                onDiscard={handleDiscard}
                onClose={() => setDrawerOpen(null)}
                onBackToWorkbench={() => { setDrawerOpen(null); setView("workbench"); }}
                onJumpToItem={(targetItem: any) => {
                  // Jump to a linked item: switch to the appropriate pool and reopen drawer on it
                  const targetView = targetItem.kind === "seed" ? "seeds" :
                                     targetItem.kind === "conflict" ? "conflicts" : "archive";
                  setDrawerOpen(null);
                  setView(targetView);
                  setTimeout(() => setDrawerOpen({ kind: "detail", item: targetItem, readonly: true }), 50);
                }}
              />
            )}
            {drawerOpen?.kind === "context" && <ContextDrawer/>}
            {drawerOpen?.kind === "pending" && (
              <PendingDrawer pendingItems={pendingItems}
                onSave={handleSave}
                onDiscard={handleDiscard}
                onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s })}/>
            )}
            {drawerOpen?.kind === "issues" && (
              <IssuesDrawer
                issues={savedIssues}
                savedSettings={savedSettings}
                focusEntryId={drawerOpen.focusEntryId}
                onResolve={handleResolveIssue}
                onPromote={handlePromoteIssueToConflict}
                onDiscard={handleDiscardIssue}
                onClose={() => setDrawerOpen(null)}
                onJumpToEntry={(entry: any) => {
                  setDrawerOpen({ kind: "detail", item: entry, readonly: true });
                }}
              />
            )}
          </Drawer>
        </main>
      </div>

      <Toasts toasts={toasts}/>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="模式 · MODE"/>
        <TweakRadio label="Mode" value={t.mode} options={["cloud", "local"]} onChange={(v: any) => setTweak("mode", v)}/>
        <TweakSection label="排版 · TYPOGRAPHY"/>
        <TweakRadio label="对话密度" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v: any) => setTweak("density", v)}/>
        <TweakRadio label="标题字体" value={t.titleFont} options={["sans", "serif"]} onChange={(v: any) => setTweak("titleFont", v)}/>
        <TweakSection label="主题 · THEME"/>
        <TweakRadio label="深浅" value={t.appTheme} options={["light", "dark"]} onChange={(v: any) => setTweak("appTheme", v)}/>
      </TweaksPanel>
    </div>
  );
}

// ────────── Workbench (composes Message + Composer) ──────────
const Workbench = ({
  world, messages, agentMode, agentBusy, savedIds, pendingCount,
  onModeChange, onSend, onStop, onSave, onOpenDetail,
  onOpenContext, onOpenSuggestions, modeFlash, contextRefs,
}: any) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll on new content
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
              <Message key={m.id} msg={m} savedIds={savedIds}
                onSave={onSave} onOpenDetail={onOpenDetail} onOpenContext={onOpenContext}/>
            ))}
          </>
        )}
      </div>
      <Composer
        mode={agentMode}
        onModeChange={onModeChange}
        onSend={onSend}
        busy={agentBusy}
        onStop={onStop}
        pendingCount={pendingCount}
        contextRefs={contextRefs}
        modeFlash={modeFlash}
        onOpenSuggestions={onOpenSuggestions}
        onOpenContext={onOpenContext}
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
      fontSize: "var(--t-28)", color: "var(--fg)", marginBottom: 12, letterSpacing: "-0.01em",
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
        在下方输入一个推演方向。Agent 会自动判断该走哪条路——
        <strong style={{ color: "var(--fg)" }}>追问</strong>、<strong style={{ color: "var(--fg)" }}>扩展</strong>、
        <strong style={{ color: "var(--fg)" }}>挑刺</strong>、<strong style={{ color: "var(--fg)" }}>找张力</strong>，或<strong style={{ color: "var(--fg)" }}>收束为设定</strong>。
      </p>
    </div>
  </div>
);

type CreateWorldDraft = {
  name?: string;
  type?: string;
  inspiration: string;
  styleKw?: string;
  avoid?: string;
  mode: string;
};

export function buildCreateWorldInput(draft: CreateWorldDraft): CreateWorldInput {
  const inspiration = draft.inspiration.trim();
  const styleKw = draft.styleKw?.trim();
  const avoid = draft.avoid?.trim();

  return {
    name: draft.name?.trim() || inferWorldName(inspiration),
    type: draft.type?.trim() || "未分类世界",
    summary: [
      `初始灵感：${inspiration}`,
      styleKw ? `风格关键词：${styleKw}` : "",
      avoid ? `避开的方向：${avoid}` : "",
    ].filter(Boolean).join("\n"),
    tags: parseStyleTags(styleKw),
    mode: draft.mode === "local" ? "local" : "cloud",
  };
}

function inferWorldName(inspiration: string) {
  const compact = inspiration.replace(/\s+/g, " ").trim();
  if (!compact) return "未命名世界";
  return compact.length > 18 ? `${compact.slice(0, 18)}...` : compact;
}

function parseStyleTags(styleKw?: string) {
  return (styleKw ?? "")
    .split(/[,\s，、·]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isCloudPersistedWorldId(id: string) {
  return !id.startsWith("new_") && !id.startsWith("copy_") && !id.startsWith("fork_");
}

function toWorldAssetInput(item: any) {
  if (item.kind === "seed") {
    return {
      kind: "seed" as const,
      title: item.title,
      category: item.category,
      summary: item.hook ?? item.summary,
      body: item.conflict ?? item.body ?? item.summary,
      payload: {
        hook: item.hook ?? item.summary,
        trigger: item.trigger,
        conflict: item.conflict ?? item.body,
        protagonists: item.protagonists,
        questions: item.questions ?? [],
      },
    };
  }
  if (item.kind === "conflict") {
    return {
      kind: "conflict" as const,
      title: item.title,
      category: item.category,
      summary: item.summary,
      body: item.body ?? item.summary,
      payload: {
        related: item.related ?? [],
        derivedSeeds: item.derivedSeeds ?? [],
      },
    };
  }
  return {
    kind: "setting" as const,
    title: item.title,
    category: item.category,
    summary: item.summary,
    body: item.body ?? item.summary,
    payload: {
      relations: item.relations ?? [],
    },
  };
}

function getBackendAgentMode(mode: string): "expand" | "challenge" | "fork" | "polish" {
  if (mode === "critique" || mode === "tension" || mode === "consequence") return "challenge";
  if (mode === "fork") return "fork";
  if (mode === "polish" || mode === "settle") return "polish";
  return "expand";
}
