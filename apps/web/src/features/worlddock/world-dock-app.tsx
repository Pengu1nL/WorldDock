"use client";

// world-dock-app.tsx — Main app shell, routing, real agent runtime

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  cancelAgentRun,
  createAgentRun,
  createWorld as createWorldRequest,
  createWorldAsset,
  deleteWorldAsset,
  deleteWorld as deleteWorldRequest,
  discardAgentSuggestion,
  duplicateWorld as duplicateWorldRequest,
  listWorldAssets,
  listWorlds,
  relateWorldAssets,
  reorderWorldAssets,
  saveAgentSuggestion,
  streamAgentEvents,
  unrelateWorldAssets,
  updateWorldAsset,
  type AgentContextRef,
  type CreateWorldInput,
  type WorldCreationDraft,
} from "./api";
import { AgentRunPanel } from "../agent/agent-run-panel";
import { ContextInspector } from "../agent/context-inspector";
import { AssetEditor } from "../world-assets/asset-editor";
import { AssetSearch } from "../world-assets/asset-search";
import { Drawer, Icon, Rail, StatusBar, Toasts } from "./components";
import {
  TweakRadio,
  TweakSection,
  TweaksPanel,
  useTweaks,
} from "./tweaks-panel";
import { ArchiveView, ConflictsView, SeedsView } from "./view-archive";
import {
  Composer,
  IssuesDrawer,
  Message,
  PendingDrawer,
  SuggestionDetail,
} from "./view-workbench";
import { PublishView } from "./view-publish";
import { SettingsView } from "./view-settings";
import { getSuggestionKey, normalizeSuggestionForSave } from "./suggestion-utils";
import { CreateView, WorldsView } from "./view-worlds";
import { getWorldStoredSummary } from "./world-summary";

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mode": "local",
  "density": "regular",
  "titleFont": "serif",
  "appTheme": "light"
}/*EDITMODE-END*/;

const worldDockQueryClient = new QueryClient();

type AgentToolEvent = {
  id: string;
  label: string;
  status: "requested" | "completed";
};

type AgentRunStatus = "idle" | "running" | "completed" | "failed";

type AgentContextSnapshot = {
  refs: AgentContextRef[];
  toolEvents: AgentToolEvent[];
  tokens: number;
  runStatus: AgentRunStatus;
};

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
  useEffect(() => { document.documentElement.dataset.direction = "obs"; }, []);
  useEffect(() => { document.documentElement.dataset.density = t.density; }, [t.density]);
  useEffect(() => { document.documentElement.dataset.titleFont = t.titleFont; }, [t.titleFont]);
  useEffect(() => { document.documentElement.dataset.appTheme = t.appTheme; }, [t.appTheme]);

  // ────────── App state ──────────
  const [view, setView] = useState<any>("worlds");  // worlds | create | workbench | archive | seeds | conflicts | publish | settings
  const [currentWorld, setCurrentWorld] = useState<any>(null);
  const [worlds, setWorlds] = useState<any[]>([]);
  const [createInspiration, setCreateInspiration] = useState("");
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<any>(null);

  // Workbench state — per current world (live copies for the open world; archived in worldStatesRef)
  const [messages, setMessages] = useState<any[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<any>(null);  // { kind: 'detail'|'context'|'pending', item, readonly? }
  const [savedSettings, setSavedSettings] = useState<any[]>([]);
  const [savedSeeds, setSavedSeeds] = useState<any[]>([]);
  const [savedConflicts, setSavedConflicts] = useState<any[]>([]);
  const [savedIssues, setSavedIssues] = useState<any[]>([]);   // 一致性问题（待修矛盾）
  const [savedIds, setSavedIds] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const [runTokens, setRunTokens] = useState(0);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [agentContextRefs, setAgentContextRefs] = useState<AgentContextRef[]>([]);
  const [agentToolEvents, setAgentToolEvents] = useState<AgentToolEvent[]>([]);
  const [agentRunStatus, setAgentRunStatus] = useState<AgentRunStatus>("idle");
  const [assetSaving, setAssetSaving] = useState(false);
  const [assetRelationQuery, setAssetRelationQuery] = useState("");
  const [localAssetRelationLabels, setLocalAssetRelationLabels] = useState<Record<string, {
    labels: string[];
    targets?: Array<{ targetAssetId: string; label: string }>;
    dataUpdatedAt: number;
  }>>({});

  const agentAbortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  // worldId → { messages, savedSettings, savedSeeds, savedConflicts, savedIds }
  const worldStatesRef = useRef<any>({});

  const worldsQuery = useQuery({
    queryKey: ["worlds"],
    queryFn: async () => listWorlds() as Promise<{ worlds: any[] }>,
    retry: false,
  });

  useEffect(() => {
    if (worldsQuery.data?.worlds) setWorlds(worldsQuery.data.worlds);
  }, [worldsQuery.data]);

  useEffect(() => {
    if (worldsQuery.isPending || worldsQuery.isError) setWorlds([]);
  }, [worldsQuery.isError, worldsQuery.isPending]);

  const worldsState = worldsQuery.isPending
    ? "loading"
    : worldsQuery.isError
      ? "error"
      : "ready";

  const assetsQuery = useQuery({
    queryKey: ["world-assets", currentWorld?.id],
    queryFn: async ({ signal }) => listAllWorldAssets(currentWorld.id, { signal }),
    enabled: Boolean(currentWorld?.id),
    retry: false,
  });

  useEffect(() => {
    if (!assetsQuery.data?.assets) return;
    const assets = assetsQuery.data.assets;
    const worldId = currentWorld?.id;
    const fromAssetWithLocalRelations = (asset: any) => (
      applyLocalRelationLabels(
        fromWorldAsset(asset),
        worldId ? (localAssetRelationLabels[getAssetRelationOverlayKey(worldId, asset.id)]?.labels ?? []) : [],
        worldId ? (localAssetRelationLabels[getAssetRelationOverlayKey(worldId, asset.id)]?.targets ?? []) : [],
      )
    );
    setSavedSettings(assets.filter((asset: any) => asset.kind === "setting").map(fromAssetWithLocalRelations));
    setSavedSeeds(assets.filter((asset: any) => asset.kind === "seed").map(fromAssetWithLocalRelations));
    setSavedConflicts(assets.filter((asset: any) => asset.kind === "conflict").map(fromAssetWithLocalRelations));
    if (worldId) {
      const refreshedIds = new Set(assets.map((asset: any) => asset.id));
      const keyPrefix = `${worldId}:`;
      setLocalAssetRelationLabels((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [key, overlay] of Object.entries(prev)) {
          if (!key.startsWith(keyPrefix)) continue;
          const sourceAssetId = key.slice(keyPrefix.length);
          if (refreshedIds.has(sourceAssetId) && assetsQuery.dataUpdatedAt > overlay.dataUpdatedAt) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [assetsQuery.data, assetsQuery.dataUpdatedAt, currentWorld?.id, localAssetRelationLabels]);

  useEffect(() => {
    if (!currentWorld || !assetsQuery.data?.assets) return;
    const nextCounts = {
      archive: assetsQuery.data.assets.filter((asset: any) => asset.kind === "setting").length,
      seeds: assetsQuery.data.assets.filter((asset: any) => asset.kind === "seed").length,
      conflicts: assetsQuery.data.assets.filter((asset: any) => asset.kind === "conflict").length,
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
  }, [assetsQuery.data, currentWorld]);

  // Persist current world's workbench state whenever it changes
  useEffect(() => {
    if (!currentWorld) return;
    worldStatesRef.current[currentWorld.id] = {
      messages, savedSettings, savedSeeds, savedConflicts, savedIssues, savedIds,
      agentContextRefs, agentToolEvents, agentRunStatus, runTokens,
    };
  }, [
    currentWorld,
    messages,
    savedSettings,
    savedSeeds,
    savedConflicts,
    savedIssues,
    savedIds,
    agentContextRefs,
    agentToolEvents,
    agentRunStatus,
    runTokens,
  ]);

  const pushToast = useCallback((toast: any) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev: any[]) => [...prev, { id, ...toast }]);
    setTimeout(() => setToasts((prev: any[]) => prev.filter((x: any) => x.id !== id)), toast.timeout || 3000);
  }, []);

  const allSavedAssets = useMemo(
    () => [...savedSettings, ...savedSeeds, ...savedConflicts],
    [savedSettings, savedSeeds, savedConflicts],
  );
  const drawerRelationTargets = drawerOpen?.kind === "asset-relation"
    ? readRelationTargets(drawerOpen.item?.relationTargets ?? drawerOpen.item?.payload?.relationTargets)
    : [];
  const latestContextSnapshot: AgentContextSnapshot = {
    refs: agentContextRefs,
    toolEvents: agentToolEvents,
    tokens: runTokens,
    runStatus: agentRunStatus,
  };

  const startAgentRun = useCallback(async (userText: string, targetWorld = currentWorld) => {
    if (agentBusy) return;
    if (!targetWorld?.id) {
      pushToast({ kind: "warn", text: "请先打开一个世界" });
      return;
    }
    setAgentBusy(true);
    setRunTokens(0);
    setAgentContextRefs([]);
    setAgentToolEvents([]);
    setAgentRunStatus("running");

    const agentMsg = {
      id: "m_" + Date.now(),
      role: "agent",
      text: "",
      tools: null,
      suggestions: null,
      streaming: true,
      contextRefs: null,
    };
    setMessages(prev => [...prev, agentMsg]);

    const abortController = new AbortController();
    agentAbortRef.current = abortController;
    try {
      const created: any = await createAgentRun(
        targetWorld.id,
        { prompt: userText },
      );
      if (agentAbortRef.current !== abortController) {
        void cancelAgentRun(created.run.id);
        return;
      }
      setActiveAgentRunId(created.run.id);
      let currentText = "";
      let contextRefs = 0;
      let latestTokens = 0;
      let latestRunStatus: AgentRunStatus = "running";
      let streamedContextRefs: AgentContextRef[] = [];
      let streamedToolEvents: AgentToolEvent[] = [];
      const suggestions: any[] = [];

      await streamAgentEvents(created.run.id, { signal: abortController.signal }, (event) => {
        if (agentAbortRef.current !== abortController) return;
        if (event.type === "pi.session.started") {
          streamedToolEvents = [
            ...streamedToolEvents,
            { id: event.payload.piSessionId, label: "pi session", status: "completed" },
          ];
          setAgentToolEvents(streamedToolEvents);
        }
        if (event.type === "message.delta") {
          currentText += event.payload.text;
          setMessages((prev: any[]) => prev.map((m: any) => m.id === agentMsg.id ? { ...m, text: currentText } : m));
          latestTokens += Math.max(1, Math.ceil(event.payload.text.length / 2));
          setRunTokens(latestTokens);
        }
        if (event.type === "context.used") {
          contextRefs++;
          streamedContextRefs = [...streamedContextRefs, event.payload.contextRef];
          setAgentContextRefs(streamedContextRefs);
        }
        if (event.type === "tool.requested") {
          streamedToolEvents = [
            ...streamedToolEvents,
            { id: event.payload.toolCall.id, label: event.payload.toolCall.name, status: "requested" },
          ];
          setAgentToolEvents(streamedToolEvents);
        }
        if (event.type === "tool.completed") {
          if (!streamedToolEvents.some((item) => item.id === event.payload.toolCallId)) {
            streamedToolEvents = [
              ...streamedToolEvents,
              { id: event.payload.toolCallId, label: event.payload.toolCallId, status: "completed" },
            ];
          } else {
            streamedToolEvents = streamedToolEvents.map((item) =>
              item.id === event.payload.toolCallId ? { ...item, status: "completed" } : item,
            );
          }
          setAgentToolEvents(streamedToolEvents);
        }
        if (event.type === "suggestion.created") {
          suggestions.push({ ...event.payload.suggestion, agentSuggestionId: event.payload.suggestionId });
        }
        if (event.type === "run.completed" && event.payload.tokenUsage) {
          latestRunStatus = "completed";
          latestTokens = event.payload.tokenUsage.totalTokens;
          setRunTokens(latestTokens);
          setAgentRunStatus("completed");
        }
        if (event.type === "run.failed") {
          latestRunStatus = "failed";
          setAgentRunStatus("failed");
          pushToast({ kind: "warn", text: event.payload.message || "模型不可用" });
        }
        if (event.type === "run.cancelled") {
          latestRunStatus = "failed";
          setAgentRunStatus("failed");
          pushToast({ kind: "warn", text: event.payload.reason || "Agent 已取消" });
        }
      });
      if (agentAbortRef.current !== abortController) return;

      if (latestRunStatus === "running") {
        latestRunStatus = "completed";
        setAgentRunStatus("completed");
      }
      const contextSnapshot: AgentContextSnapshot = {
        refs: streamedContextRefs,
        toolEvents: streamedToolEvents,
        tokens: latestTokens,
        runStatus: latestRunStatus,
      };
      setMessages((prev: any[]) => prev.map((m: any) => m.id === agentMsg.id
        ? { ...m, streaming: false, suggestions, contextRefs, contextSnapshot }
        : m));
      if (agentAbortRef.current === abortController) agentAbortRef.current = null;
      setAgentBusy(false);
      setActiveAgentRunId(null);
    } catch (error) {
      if (isAbortError(error)) {
        if (agentAbortRef.current === abortController) {
          agentAbortRef.current = null;
          setAgentBusy(false);
          setActiveAgentRunId(null);
        }
        return;
      }
      agentAbortRef.current = null;
      setMessages((prev: any[]) => prev.filter((m: any) => m.id !== agentMsg.id));
      setAgentBusy(false);
      setActiveAgentRunId(null);
      pushToast({ kind: "warn", text: "Agent 调用失败 · 请检查后端、Provider 和 API Key" });
    }
  }, [agentBusy, currentWorld, pushToast]);

  const stopAgent = useCallback(() => {
    if (activeAgentRunId) {
      void cancelAgentRun(activeAgentRunId);
      setActiveAgentRunId(null);
    }
    const contextSnapshot: AgentContextSnapshot = {
      refs: agentContextRefs,
      toolEvents: agentToolEvents,
      tokens: runTokens,
      runStatus: "failed",
    };
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;
    setAgentBusy(false);
    setAgentRunStatus("failed");
    setMessages((prev: any[]) => prev.map((m: any) => m.streaming
      ? { ...m, streaming: false, text: m.text + " [已停止]", contextRefs: agentContextRefs.length, contextSnapshot }
      : m));
  }, [activeAgentRunId, agentContextRefs, agentToolEvents, runTokens]);

  // ────────── Navigation handlers ──────────
  const openWorld = (id: string) => {
    const w = worlds.find((world: any) => world.id === id);
    if (!w) return;
    if (activeAgentRunId) {
      void cancelAgentRun(activeAgentRunId);
    }
    if (agentAbortRef.current) {
      const contextSnapshot: AgentContextSnapshot = {
        refs: agentContextRefs,
        toolEvents: agentToolEvents,
        tokens: runTokens,
        runStatus: "failed",
      };
      const stoppedMessages = messages.map((message: any) => message.streaming
        ? { ...message, streaming: false, text: `${message.text} [已停止]`, contextRefs: agentContextRefs.length, contextSnapshot }
        : message);
      if (currentWorld?.id) {
        worldStatesRef.current[currentWorld.id] = {
          ...(worldStatesRef.current[currentWorld.id] ?? {}),
          messages: stoppedMessages,
          savedSettings,
          savedSeeds,
          savedConflicts,
          savedIssues,
          savedIds,
          agentContextRefs,
          agentToolEvents,
          agentRunStatus: "failed",
          runTokens,
        };
      }
      agentAbortRef.current.abort();
      agentAbortRef.current = null;
      setAgentBusy(false);
      setActiveAgentRunId(null);
      setAgentRunStatus("failed");
    }
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
      setAgentContextRefs(saved.agentContextRefs || []);
      setAgentToolEvents(saved.agentToolEvents || []);
      setAgentRunStatus(saved.agentRunStatus || "idle");
      setRunTokens(saved.runTokens || 0);
    } else {
      setMessages([]);
      setSavedSettings([]);
      setSavedSeeds([]);
      setSavedConflicts([]);
      setSavedIssues([]);
      setSavedIds([]);
      setAgentContextRefs([]);
      setAgentToolEvents([]);
      setAgentRunStatus("idle");
      setRunTokens(0);
    }
  };

  const continueDraft = () => {
    if (!recentlyCreatedId) return;
    openWorld(recentlyCreatedId);
  };

  const deleteWorld = async (id: string) => {
    try {
      await deleteWorldRequest(id);
    } catch {
      pushToast({ kind: "warn", text: "删除失败 · 请检查本地 API 服务" });
      return;
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
    try {
      const created: any = await duplicateWorldRequest(id);
      setWorlds((prev: any[]) => [created.world, ...prev.filter((world: any) => world.id !== created.world.id)]);
      pushToast({ kind: "save", text: `已复制 · ${created.world.name}` });
    } catch {
      pushToast({ kind: "warn", text: "复制失败 · 请检查本地 API 服务" });
    }
  };

  const handleCreateWorld = async ({ name, type, inspiration, styleKw, avoid, draft }: any) => {
    try {
      const created: any = await createWorldRequest(
        buildCreateWorldInput({ name, type, inspiration, styleKw, avoid, draft, mode: t.mode }),
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
      setAgentContextRefs([]);
      setAgentToolEvents([]);
      setAgentRunStatus("idle");
      setRunTokens(0);
      setView("workbench");
      setTimeout(() => startAgentRun(inspiration, newWorld), 200);
    } catch {
      pushToast({ kind: "warn", text: "创建世界失败 · 请检查本地 API 服务" });
    }
  };

  // Save suggestion handler
  const handleSave = async (item: any) => {
    const normalizedItem = normalizeSuggestionForSave(item);
    const suggestionKey = getSuggestionKey(normalizedItem);
    if (savedIds.includes(suggestionKey)) return;
    let savedItem = normalizedItem;
    let appendSavedItem = true;
    if (normalizedItem.agentSuggestionId) {
      try {
        const saved = await saveAgentSuggestion(normalizedItem.agentSuggestionId);
        const returnedAsset = saved.asset ?? saved.savedAsset ?? saved.suggestion?.asset ?? saved.suggestion?.savedAsset;
        if (returnedAsset) savedItem = fromWorldAsset(returnedAsset);
        else appendSavedItem = false;
        if (currentWorld?.id) {
          void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
        }
      } catch {
        pushToast({ kind: "warn", text: "保存失败 · 请检查本地 API 服务" });
        return;
      }
    } else if (currentWorld?.id) {
      try {
        const created = await createWorldAsset(currentWorld.id, toWorldAssetInput(normalizedItem));
        savedItem = fromWorldAsset(created.asset);
        void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
      } catch {
        pushToast({ kind: "warn", text: "资产保存失败 · 请检查本地 API 服务" });
        return;
      }
    }
    setSavedIds((prev: any[]) => [...new Set([...prev, suggestionKey].filter(Boolean))]);
    if (appendSavedItem) {
      if (savedItem.kind === "setting") setSavedSettings((prev: any[]) => [...prev, savedItem]);
      if (savedItem.kind === "seed") setSavedSeeds((prev: any[]) => [...prev, savedItem]);
      if (savedItem.kind === "conflict") setSavedConflicts((prev: any[]) => [...prev, savedItem]);
    }
    if (savedItem.kind === "setting") {
      pushToast({ kind: "save", text: `已保存到档案 · ${savedItem.title}`, action: { label: "查看", onClick: () => setView("archive") } });
    } else if (savedItem.kind === "seed") {
      pushToast({ kind: "save", text: `已保存到种子池 · ${savedItem.title}`, action: { label: "查看", onClick: () => setView("seeds") } });
    } else if (savedItem.kind === "conflict") {
      pushToast({ kind: "save", text: `已记入冲突池 · ${savedItem.title}` });
    }
    if (currentWorld) {
      setCurrentWorld((prev: any) => ({
        ...prev,
        hasUnsaved: false,
      }));
    }
    // Auto-close drawer
    setDrawerOpen(null);
  };

  const handleDiscard = async (item: any) => {
    const suggestionKey = getSuggestionKey(item);
    if (item.agentSuggestionId) {
      try {
        await discardAgentSuggestion(item.agentSuggestionId);
      } catch {
        pushToast({ kind: "warn", text: "丢弃失败 · 请检查本地 API 服务" });
        return;
      }
    }
    setSavedIds((prev: any[]) => [...new Set([...prev, suggestionKey].filter(Boolean))]);
    pushToast({ kind: "warn", text: `已丢弃 · ${item.title}` });
    setDrawerOpen(null);
  };

  const openAssetEditor = (kind: "setting" | "seed" | "conflict", asset?: any) => {
    setAssetSaving(false);
    setDrawerOpen({
      kind: "asset-editor",
      item: asset ?? {
        kind,
        title: "",
        category: kind === "setting" ? "世界规则" : kind === "seed" ? "故事种子" : "冲突",
        summary: "",
        body: "",
        payload: {},
      },
    });
  };

  const openAssetRelation = (asset: any) => {
    setAssetRelationQuery("");
    setDrawerOpen({ kind: "asset-relation", item: asset });
  };

  const saveEditedAsset = async (draft: any) => {
    if (!currentWorld?.id) {
      pushToast({ kind: "warn", text: "请先打开一个世界" });
      return;
    }
    setAssetSaving(true);
    try {
      const saved = draft.id
        ? await updateWorldAsset(currentWorld.id, draft.id, toWorldAssetUpdateInput(draft))
        : await createWorldAsset(currentWorld.id, toWorldAssetInput(draft));
      void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
      setDrawerOpen(null);
      pushToast({ kind: "save", text: `已保存资产 · ${saved.asset.title}` });
    } catch {
      pushToast({ kind: "warn", text: "资产保存失败 · 请检查本地 API 服务" });
    } finally {
      setAssetSaving(false);
    }
  };

  const removeEditedAsset = async (asset: any) => {
    if (!currentWorld?.id) {
      pushToast({ kind: "warn", text: "请先打开一个世界" });
      return;
    }
    if (!asset.id) {
      pushToast({ kind: "warn", text: "缺少资产 ID，无法删除" });
      return;
    }
    setAssetSaving(true);
    try {
      await deleteWorldAsset(currentWorld.id, asset.id);
      void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
      setDrawerOpen(null);
      pushToast({ kind: "warn", text: `已删除资产 · ${asset.title}` });
    } catch {
      pushToast({ kind: "warn", text: "资产删除失败 · 请检查本地 API 服务" });
    } finally {
      setAssetSaving(false);
    }
  };

  const reorderAssets = async (assetIds: string[]) => {
    if (!currentWorld?.id) {
      pushToast({ kind: "warn", text: "请先打开一个世界" });
      return;
    }
    if (assetIds.length === 0) {
      pushToast({ kind: "warn", text: "缺少资产，无法排序" });
      return;
    }
    try {
      await reorderWorldAssets(currentWorld.id, assetIds);
      void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
    } catch {
      pushToast({ kind: "warn", text: "资产排序失败 · 请检查本地 API 服务" });
    }
  };

  const relateAssets = async (sourceAsset: any, targetAsset: any) => {
    if (!currentWorld?.id) {
      pushToast({ kind: "warn", text: "请先打开一个世界" });
      return false;
    }
    if (!sourceAsset?.id || !targetAsset?.id) {
      pushToast({ kind: "warn", text: "缺少资产 ID，无法关联" });
      return false;
    }
    try {
      await relateWorldAssets(currentWorld.id, sourceAsset.id, targetAsset.id);
      const relationLabel = targetAsset.title || targetAsset.id;
      const relationTarget = { targetAssetId: targetAsset.id, label: relationLabel };
      const overlayKey = getAssetRelationOverlayKey(currentWorld.id, sourceAsset.id);
      setLocalAssetRelationLabels((prev) => ({
        ...prev,
        [overlayKey]: {
          labels: appendUniqueRelations(prev[overlayKey]?.labels, [relationLabel]),
          targets: appendUniqueRelationTargets(prev[overlayKey]?.targets, [relationTarget]),
          dataUpdatedAt: prev[overlayKey]?.dataUpdatedAt ?? assetsQuery.dataUpdatedAt,
        },
      }));
      setSavedSettings((prev: any[]) => prev.map((asset: any) =>
        asset.id === sourceAsset.id ? applyLocalRelationLabels(asset, [relationLabel], [relationTarget]) : asset,
      ));
      setSavedSeeds((prev: any[]) => prev.map((asset: any) =>
        asset.id === sourceAsset.id ? applyLocalRelationLabels(asset, [relationLabel], [relationTarget]) : asset,
      ));
      setSavedConflicts((prev: any[]) => prev.map((asset: any) =>
        asset.id === sourceAsset.id ? applyLocalRelationLabels(asset, [relationLabel], [relationTarget]) : asset,
      ));
      void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
      pushToast({ kind: "save", text: `已关联资产 · ${relationLabel}` });
      return true;
    } catch {
      pushToast({ kind: "warn", text: "资产关联失败 · 请检查本地 API 服务" });
      return false;
    }
  };

  const unrelateAssets = async (sourceAsset: any, targetAssetId: string, relationLabel: string) => {
    if (!currentWorld?.id) {
      pushToast({ kind: "warn", text: "请先打开一个世界" });
      return false;
    }
    if (!sourceAsset?.id || !targetAssetId) {
      pushToast({ kind: "warn", text: "缺少资产 ID，无法解除关联" });
      return false;
    }
    try {
      await unrelateWorldAssets(currentWorld.id, sourceAsset.id, targetAssetId);
      const overlayKey = getAssetRelationOverlayKey(currentWorld.id, sourceAsset.id);
      setLocalAssetRelationLabels((prev) => {
        const overlay = prev[overlayKey];
        if (!overlay) return prev;
        const labels = removeRelations(overlay.labels, [relationLabel]);
        const targets = removeRelationTargets(overlay.targets, [targetAssetId]);
        if (labels.length === 0 && targets.length === 0) {
          const next = { ...prev };
          delete next[overlayKey];
          return next;
        }
        return {
          ...prev,
          [overlayKey]: { ...overlay, labels, targets },
        };
      });
      const removeFromAsset = (asset: any) =>
        asset.id === sourceAsset.id ? removeLocalRelationLabels(asset, [relationLabel], [targetAssetId]) : asset;
      setSavedSettings((prev: any[]) => prev.map(removeFromAsset));
      setSavedSeeds((prev: any[]) => prev.map(removeFromAsset));
      setSavedConflicts((prev: any[]) => prev.map(removeFromAsset));
      setDrawerOpen((prev: any) => (
        prev?.kind === "asset-relation" && prev.item?.id === sourceAsset.id
          ? { ...prev, item: removeLocalRelationLabels(prev.item, [relationLabel], [targetAssetId]) }
          : prev
      ));
      void worldDockQueryClient.invalidateQueries({ queryKey: ["world-assets", currentWorld.id] });
      pushToast({ kind: "save", text: `已解除关联 · ${relationLabel}` });
      return true;
    } catch {
      pushToast({ kind: "warn", text: "解除关联失败 · 请检查本地 API 服务" });
      return false;
    }
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
      if (m.suggestions) for (const s of m.suggestions) set.set(getSuggestionKey(s), s);
    }
    return [...set.values()];
  }, [messages]);
  const pendingItems = useMemo(() => allSuggestions.filter((s: any) => !savedIds.includes(getSuggestionKey(s))), [allSuggestions, savedIds]);

  // ────────── Top-level render ──────────
  return (
    <div className="app">
      <StatusBar
        world={currentWorld && view !== "worlds" && view !== "create" ? currentWorld : null}
        mode={t.mode}
        tokens={runTokens}
      />
      <div className="app-body">
        <Rail
          view={view}
          onNav={(v: any) => {
            if (v === "worlds") setView("worlds");
            else if (v === "settings") setView("settings");
            else if (currentWorld) setView(v);
            else setView("worlds");
          }}
          world={currentWorld && view !== "worlds" && view !== "create" ? currentWorld : null}
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
                worldsState={worldsState}
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
              agentBusy={agentBusy}
              savedIds={savedIds}
              pendingCount={pendingItems.length}
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
              onOpenContext={(snapshot?: AgentContextSnapshot) => setDrawerOpen({ kind: "context", snapshot })}
              onOpenSuggestions={() => setDrawerOpen({ kind: "pending" })}
            />
          )}
          {view === "archive" && currentWorld && (
            <ArchiveView world={currentWorld} savedSettings={savedSettings} savedIssues={savedIssues}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onOpenIssues={(focusEntryId: any) => setDrawerOpen({ kind: "issues", focusEntryId })}
              onCreateAsset={openAssetEditor}
              onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
              onDeleteAsset={removeEditedAsset}
              onReorderAssets={reorderAssets}
              onRelateAssets={openAssetRelation}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "seeds" && currentWorld && (
            <SeedsView world={currentWorld} savedSeeds={savedSeeds} savedConflicts={savedConflicts}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onJumpToConflict={(c: any) => { setDrawerOpen(null); setView("conflicts"); setTimeout(() => setDrawerOpen({ kind: "detail", item: c, readonly: true }), 50); }}
              onCreateAsset={openAssetEditor}
              onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
              onDeleteAsset={removeEditedAsset}
              onReorderAssets={reorderAssets}
              onRelateAssets={openAssetRelation}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "conflicts" && currentWorld && (
            <ConflictsView world={currentWorld} savedConflicts={savedConflicts} savedSeeds={savedSeeds}
              onOpenDetail={(s: any) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onCreateAsset={openAssetEditor}
              onEditAsset={(asset: any) => openAssetEditor(asset.kind, asset)}
              onDeleteAsset={removeEditedAsset}
              onReorderAssets={reorderAssets}
              onRelateAssets={openAssetRelation}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "publish" && currentWorld && (
            <PublishView
              currentWorld={currentWorld}
              assets={allSavedAssets}
              onToast={pushToast}
              onBack={() => setView("workbench")}
            />
          )}
          {view === "settings" && (
            <SettingsView
              onBack={() => setView("worlds")}
              onToast={pushToast}
              currentWorld={currentWorld}
            />
          )}

          {/* Drawer */}
          <Drawer
            open={!!drawerOpen}
            onClose={() => setDrawerOpen(null)}
            width={drawerOpen?.kind === "issues" ? 520 : undefined}
            title={
              drawerOpen?.kind === "asset-editor" ? (drawerOpen.item?.id ? "编辑资产" : "新建资产") :
              drawerOpen?.kind === "asset-relation" ? "关联资产" :
              drawerOpen?.kind === "detail" ? "编辑并确认" :
              drawerOpen?.kind === "context" ? "本轮上下文" :
              drawerOpen?.kind === "pending" ? `待处理建议 · ${pendingItems.length}` :
              drawerOpen?.kind === "issues" ? `一致性问题 · ${savedIssues.length}` : ""
            }
            subtitle={
              drawerOpen?.kind === "asset-editor" ? "直接创建或更新世界资产" :
              drawerOpen?.kind === "asset-relation" ? "选择一个目标资产建立关联" :
              drawerOpen?.kind === "detail" ? "确认后会成为世界资产" :
              drawerOpen?.kind === "context" ? "Agent 本轮使用了哪些已确认资料" :
              drawerOpen?.kind === "pending" ? "保存有价值的，丢弃无关的" :
              drawerOpen?.kind === "issues" ? "Agent 发现的待修矛盾 · 三选一：修 / 留为冲突 / 弃" : ""
            }
          >
            {drawerOpen?.kind === "asset-editor" && drawerOpen.item && (
              <AssetEditor
                asset={drawerOpen.item}
                saving={assetSaving}
                onChange={(item) => setDrawerOpen({ kind: "asset-editor", item })}
                onSubmit={() => saveEditedAsset(drawerOpen.item)}
                onDelete={drawerOpen.item.id ? () => removeEditedAsset(drawerOpen.item) : undefined}
              />
            )}
            {drawerOpen?.kind === "asset-relation" && drawerOpen.item && (
              <div className="col gap-3">
                <div className="card" style={{ padding: 12 }}>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)", marginBottom: 6 }}>
                    来源资产
                  </div>
                  <div className="title-font" style={{ fontSize: "var(--t-15)", fontWeight: 600 }}>
                    {drawerOpen.item.title}
                  </div>
                  <p className="prose" style={{ fontSize: "var(--t-12)", color: "var(--fg-2)", marginTop: 6 }}>
                    {drawerOpen.item.summary}
                  </p>
                </div>
                {drawerRelationTargets.length > 0 && (
                  <div className="col gap-2">
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
                      当前关联
                    </div>
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      {drawerRelationTargets.map((target: any) => (
                        <button
                          key={target.targetAssetId}
                          className="tag plain"
                          type="button"
                          aria-label={`解除关联 ${target.label}`}
                          title="解除关联"
                          onClick={() => unrelateAssets(drawerOpen.item, target.targetAssetId, target.label)}
                          style={{ cursor: "pointer" }}
                        >
                          ↳ {target.label} ×
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <AssetSearch
                  assets={allSavedAssets.filter((asset: any) => asset.id !== drawerOpen.item.id)}
                  query={assetRelationQuery}
                  onQueryChange={setAssetRelationQuery}
                  onPick={async (target: any) => {
                    const related = await relateAssets(drawerOpen.item, target);
                    if (!related) return;
                    setAssetRelationQuery("");
                    setDrawerOpen(null);
                  }}
                />
              </div>
            )}
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
            {drawerOpen?.kind === "context" && (
              <AgentContextDrawer
                snapshot={drawerOpen.snapshot ?? latestContextSnapshot}
              />
            )}
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
        <TweakSection label="排版 · TYPOGRAPHY"/>
        <TweakRadio label="对话密度" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v: any) => setTweak("density", v)}/>
        <TweakRadio label="标题字体" value={t.titleFont} options={["sans", "serif"]} onChange={(v: any) => setTweak("titleFont", v)}/>
        <TweakSection label="主题 · THEME"/>
        <TweakRadio label="深浅" value={t.appTheme} options={["light", "dark"]} onChange={(v: any) => setTweak("appTheme", v)}/>
      </TweaksPanel>
    </div>
  );
}

const AgentContextDrawer = ({ snapshot }: { snapshot: AgentContextSnapshot }) => (
  <div className="col gap-4">
    <AgentRunPanel status={snapshot.runStatus} tokens={snapshot.tokens}>
      <div className="col gap-2" style={{ marginTop: 12 }}>
        {snapshot.toolEvents.length === 0 ? (
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>本轮暂无工具事件</span>
        ) : (
          snapshot.toolEvents.map((tool) => (
            <span key={tool.id} className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
              {tool.label} · {tool.status}
            </span>
          ))
        )}
      </div>
    </AgentRunPanel>
    <ContextInspector refs={snapshot.refs} />
  </div>
);

// ────────── Workbench (composes Message + Composer) ──────────
const Workbench = ({
  world, messages, agentBusy, savedIds, pendingCount,
  onSend, onStop, onSave, onOpenDetail,
  onOpenContext, onOpenSuggestions, contextRefs,
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

type CreateWorldDraft = {
  name?: string;
  type?: string;
  inspiration: string;
  styleKw?: string;
  avoid?: string;
  draft?: WorldCreationDraft;
  mode: string;
};

export function buildCreateWorldInput(draft: CreateWorldDraft): CreateWorldInput {
  const inspiration = draft.inspiration.trim();
  const styleKw = draft.styleKw?.trim();
  const generated = draft.draft;
  const styleTags = parseStyleTags(styleKw);

  return {
    name: draft.name?.trim() || generated?.suggestedName?.trim() || inferWorldName(inspiration),
    type: draft.type?.trim() || generated?.suggestedType?.trim() || "未分类世界",
    summary: getWorldStoredSummary({
      shortSummary: generated?.shortSummary,
      coreSetting: generated?.coreSetting,
      inspiration,
    }),
    tags: styleTags.length > 0 ? styleTags : (generated?.styles ?? []).slice(0, 8),
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

function getAssetRelationOverlayKey(worldId: string, assetId: string) {
  return `${worldId}:${assetId}`;
}

function getMessageSavedSuggestionIds(message: any, savedSuggestionKeys: any[]) {
  if (!message.suggestions) return [];
  return message.suggestions
    .filter((suggestion: any) => savedSuggestionKeys.includes(getSuggestionKey(suggestion)))
    .map((suggestion: any) => getSuggestionKey(suggestion));
}

const MAX_WORLD_ASSET_PAGES = 100;

async function listAllWorldAssets(worldId: string, options: Parameters<typeof listWorldAssets>[1]) {
  const queryOptions = options ?? {};
  const assets: any[] = [];
  const seenCursors = new Set<string>();
  let cursor = queryOptions.cursor;

  for (let pageCount = 0; pageCount < MAX_WORLD_ASSET_PAGES; pageCount++) {
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error("World assets pagination returned a repeated cursor.");
      }
      seenCursors.add(cursor);
    }

    const page = await listWorldAssets(worldId, { ...queryOptions, cursor });
    assets.push(...page.assets);
    cursor = page.nextCursor ?? undefined;
    if (!cursor) return { assets, nextCursor: null };
  }

  throw new Error("World assets pagination exceeded 100 pages.");
}

function fromWorldAsset(asset: any) {
  const relationLabels = readStringArray(asset.payload?.relationLabels);
  const relationTargets = readRelationTargets(asset.payload?.relationTargets);
  if (asset.kind === "seed") {
    return {
      ...asset,
      hook: asset.payload?.hook ?? asset.summary,
      trigger: asset.payload?.trigger,
      conflict: asset.payload?.conflict ?? asset.body,
      protagonists: asset.payload?.protagonists,
      questions: asset.payload?.questions ?? [],
      relations: appendUniqueRelations(asset.payload?.relations ?? [], relationLabels),
      relationTargets,
    };
  }
  if (asset.kind === "conflict") {
    return {
      ...asset,
      related: appendUniqueRelations(asset.payload?.related ?? [], relationLabels),
      relationTargets,
      derivedSeeds: asset.payload?.derivedSeeds ?? [],
    };
  }
  return {
    ...asset,
    relations: appendUniqueRelations(asset.payload?.relations ?? [], relationLabels),
    relationTargets,
  };
}

function appendUniqueRelations(current: any, labels: any[]) {
  const next = Array.isArray(current) ? current.filter(Boolean) : [];
  for (const rawLabel of labels) {
    const label = String(rawLabel ?? "").trim();
    if (label && !next.includes(label)) next.push(label);
  }
  return next;
}

function appendUniqueRelationTargets(current: any, targets: Array<{ targetAssetId: string; label: string }>) {
  const next = readRelationTargets(current);
  for (const target of targets) {
    const targetAssetId = String(target?.targetAssetId ?? "").trim();
    const label = String(target?.label ?? "").trim();
    if (!targetAssetId || !label) continue;
    if (!next.some((item) => item.targetAssetId === targetAssetId)) next.push({ targetAssetId, label });
  }
  return next;
}

function applyLocalRelationLabels(asset: any, labels: string[], targets: Array<{ targetAssetId: string; label: string }> = []) {
  if (labels.length === 0) return asset;
  const relationTargets = appendUniqueRelationTargets(asset.relationTargets ?? asset.payload?.relationTargets, targets);
  if (asset.kind === "conflict") {
    const related = appendUniqueRelations(asset.related, labels);
    return {
      ...asset,
      related,
      relationTargets,
      payload: {
        ...(asset.payload ?? {}),
        relationLabels: appendUniqueRelations(asset.payload?.relationLabels, labels),
        relationTargets,
      },
    };
  }

  const relations = appendUniqueRelations(asset.relations, labels);
  return {
    ...asset,
    relations,
    relationTargets,
    payload: {
      ...(asset.payload ?? {}),
      relationLabels: appendUniqueRelations(asset.payload?.relationLabels, labels),
      relationTargets,
    },
  };
}

function removeRelations(current: any, labels: string[]) {
  const removeSet = new Set(labels.map((label) => String(label ?? "").trim()).filter(Boolean));
  return readStringArray(current).filter((item) => !removeSet.has(item));
}

function removeRelationTargets(current: any, targetAssetIds: string[]) {
  const removeSet = new Set(targetAssetIds.map((id) => String(id ?? "").trim()).filter(Boolean));
  return readRelationTargets(current).filter((item) => !removeSet.has(item.targetAssetId));
}

function removeLocalRelationLabels(asset: any, labels: string[], targetAssetIds: string[]) {
  const relationTargets = removeRelationTargets(asset.relationTargets ?? asset.payload?.relationTargets, targetAssetIds);
  const relationLabels = removeRelations(asset.payload?.relationLabels, labels);
  if (asset.kind === "conflict") {
    return {
      ...asset,
      related: removeRelations(asset.related, labels),
      relationTargets,
      payload: {
        ...(asset.payload ?? {}),
        relationLabels,
        relationTargets,
      },
    };
  }

  return {
    ...asset,
    relations: removeRelations(asset.relations, labels),
    relationTargets,
    payload: {
      ...(asset.payload ?? {}),
      relationLabels,
      relationTargets,
    },
  };
}

function readStringArray(value: any) {
  return Array.isArray(value) ? value.filter((item: any): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readRelationTargets(value: any) {
  return Array.isArray(value)
    ? value
      .map((item: any) => ({
        targetAssetId: String(item?.targetAssetId ?? "").trim(),
        label: String(item?.label ?? "").trim(),
      }))
      .filter((item: any) => item.targetAssetId && item.label)
    : [];
}

function readNonEmptyText(value: any, ...fallbacks: any[]) {
  const values = [value, ...fallbacks];
  for (const item of values) {
    if (item === null || item === undefined) continue;
    const text = String(item).trim();
    if (text) return text;
  }
  return "";
}

function readOptionalText(value: any) {
  return readNonEmptyText(value) || undefined;
}

function toWorldAssetInput(item: any) {
  if (item.kind === "seed") {
    const title = readNonEmptyText(item.title);
    const category = readOptionalText(item.category);
    const summary = readNonEmptyText(item.summary, item.hook);
    const body = readNonEmptyText(item.body, item.conflict, summary);
    return {
      kind: "seed" as const,
      title,
      category,
      summary,
      body,
      payload: {
        hook: summary,
        trigger: item.trigger,
        conflict: body,
        protagonists: item.protagonists,
        questions: item.questions ?? [],
        relations: readStoredRelationStrings(item, "relations", item.relations),
      },
    };
  }
  if (item.kind === "conflict") {
    const title = readNonEmptyText(item.title);
    const category = readOptionalText(item.category);
    const summary = readNonEmptyText(item.summary);
    const body = readNonEmptyText(item.body, summary);
    return {
      kind: "conflict" as const,
      title,
      category,
      summary,
      body,
      payload: {
        related: readStoredRelationStrings(item, "related", item.related),
        derivedSeeds: item.derivedSeeds ?? [],
      },
    };
  }
  const title = readNonEmptyText(item.title);
  const category = readOptionalText(item.category);
  const summary = readNonEmptyText(item.summary);
  const body = readNonEmptyText(item.body, summary);
  return {
    kind: "setting" as const,
    title,
    category,
    summary,
    body,
    payload: {
      relations: readStoredRelationStrings(item, "relations", item.relations),
    },
  };
}

function readStoredRelationStrings(item: any, payloadKey: string, fallback: any) {
  if (Array.isArray(item.payload?.[payloadKey])) return readStringArray(item.payload[payloadKey]);
  return readStringArray(fallback);
}

function toWorldAssetUpdateInput(item: any) {
  const input = toWorldAssetInput(item);
  return {
    title: input.title,
    category: input.category,
    summary: input.summary,
    body: input.body,
    payload: input.payload,
  };
}
