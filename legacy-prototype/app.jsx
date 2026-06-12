// app.jsx — Main app shell, routing, agent simulation

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mode": "cloud",
  "seedKey": "memory",
  "density": "regular",
  "titleFont": "serif",
  "appTheme": "light"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply density / font tweaks
  useEffect(() => { document.documentElement.dataset.density = t.density; }, [t.density]);
  useEffect(() => { document.documentElement.dataset.titleFont = t.titleFont; }, [t.titleFont]);
  useEffect(() => { document.documentElement.dataset.appTheme = t.appTheme; }, [t.appTheme]);

  // ────────── App state ──────────
  const [view, setView] = useState("worlds");  // worlds | create | workbench | archive | seeds | conflicts | explore | settings
  const [currentWorld, setCurrentWorld] = useState(null);
  const [worlds, setWorlds] = useState(window.MOCK.PREMADE_WORLDS);
  const [createInspiration, setCreateInspiration] = useState("");
  const [recentlyCreatedId, setRecentlyCreatedId] = useState(null);

  // Workbench state — per current world (live copies for the open world; archived in worldStatesRef)
  const [messages, setMessages] = useState([]);
  const [agentMode, setAgentMode] = useState("expand");
  const [agentBusy, setAgentBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(null);  // { kind: 'detail'|'context'|'pending', item, readonly? }
  const [savedSettings, setSavedSettings] = useState([]);
  const [savedSeeds, setSavedSeeds] = useState([]);
  const [savedConflicts, setSavedConflicts] = useState([]);
  const [savedIssues, setSavedIssues] = useState([]);   // 一致性问题（待修矛盾）
  const [savedIds, setSavedIds] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [balance, setBalance] = useState(82.40);
  const [runTokens, setRunTokens] = useState(0);
  const [modeFlash, setModeFlash] = useState(null);  // flash banner when agent mode changes mid-thread

  const streamingTimer = useRef(null);
  const mainRef = useRef(null);
  // worldId → { messages, savedSettings, savedSeeds, savedConflicts, savedIds, agentMode }
  const worldStatesRef = useRef({});

  // Persist current world's workbench state whenever it changes
  useEffect(() => {
    if (!currentWorld) return;
    worldStatesRef.current[currentWorld.id] = {
      messages, savedSettings, savedSeeds, savedConflicts, savedIssues, savedIds, agentMode,
    };
  }, [currentWorld, messages, savedSettings, savedSeeds, savedConflicts, savedIssues, savedIds, agentMode]);

  const pushToast = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, ...toast }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), toast.timeout || 3000);
  }, []);

  // ────────── Mock Agent streaming ──────────
  const seedData = window.MOCK.SEEDS[t.seedKey] || window.MOCK.SEEDS.memory;

  const startAgentRun = useCallback((userText, isInitial = false) => {
    if (agentBusy) return;
    setAgentBusy(true);
    setRunTokens(0);

    // Pick streaming content. Initial run uses the full seed responseChunks + suggestions.
    // Subsequent runs simulate a shorter response with no new suggestions to keep it simple.
    const responseChunks = isInitial ? seedData.responseChunks :
      ["明白。", "\n\n" + getFollowUpResponse(agentMode, userText, seedData), ""];
    const tools = isInitial ? seedData.tools : null;
    const suggestions = isInitial ? seedData.suggestions : null;

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

    let toolIdx = 0;
    let chunkIdx = 0;
    let charIdx = 0;
    let currentText = "";

    const tick = () => {
      // Phase 1 — tool calls
      if (tools && toolIdx < tools.length) {
        setMessages(prev => prev.map(m => m.id === agentMsg.id
          ? { ...m, tools: tools.slice(0, toolIdx + 1) }
          : m));
        toolIdx++;
        streamingTimer.current = setTimeout(tick, 500);
        return;
      }
      // Phase 2 — stream chunks character-by-character (chunked)
      if (chunkIdx < responseChunks.length) {
        const chunk = responseChunks[chunkIdx];
        if (charIdx < chunk.length) {
          const step = chunk.startsWith("\n\n**") && charIdx === 0 ? 1 : 6;
          currentText += chunk.slice(charIdx, charIdx + step);
          charIdx += step;
          setMessages(prev => prev.map(m => m.id === agentMsg.id
            ? { ...m, text: currentText }
            : m));
          setRunTokens(tk => tk + 2);
          streamingTimer.current = setTimeout(tick, 22);
          return;
        }
        chunkIdx++;
        charIdx = 0;
        streamingTimer.current = setTimeout(tick, chunkIdx === responseChunks.length - 1 ? 80 : 140);
        return;
      }
      // Done
      setMessages(prev => prev.map(m => m.id === agentMsg.id
        ? { ...m, streaming: false, suggestions, contextRefs: isInitial ? 4 : 2 }
        : m));
      setAgentBusy(false);
      // Deduct balance (cloud only)
      if (t.mode === "cloud") {
        const cost = (isInitial ? 1.83 : 0.62);
        setBalance(b => Math.max(0, b - cost));
      }
      streamingTimer.current = null;
    };
    tick();
  }, [agentBusy, agentMode, seedData, t.mode]);

  const stopAgent = useCallback(() => {
    if (streamingTimer.current) clearTimeout(streamingTimer.current);
    streamingTimer.current = null;
    setAgentBusy(false);
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false, text: m.text + " [已停止]" } : m));
  }, []);

  // Reset streaming if seedKey or world changes
  useEffect(() => () => { if (streamingTimer.current) clearTimeout(streamingTimer.current); }, []);

  // ────────── Navigation handlers ──────────
  const openWorld = (id) => {
    const w = worlds.find(w => w.id === id);
    if (!w) return;
    // Stop any streaming on the current world before switching
    if (streamingTimer.current) { clearTimeout(streamingTimer.current); streamingTimer.current = null; setAgentBusy(false); }
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

  const deleteWorld = (id) => {
    setWorlds(prev => prev.filter(w => w.id !== id));
    delete worldStatesRef.current[id];
    if (recentlyCreatedId === id) setRecentlyCreatedId(null);
    if (currentWorld?.id === id) { setCurrentWorld(null); setView("worlds"); }
    pushToast({ kind: "warn", text: "已删除世界" });
  };

  const duplicateWorld = (id) => {
    const w = worlds.find(w => w.id === id);
    if (!w) return;
    const copy = { ...w, id: "copy_" + Date.now(), name: w.name + " · 副本", status: "draft", updated: "刚刚", isNew: true };
    setWorlds(prev => [copy, ...prev]);
    // Copy workbench state too
    if (worldStatesRef.current[id]) {
      worldStatesRef.current[copy.id] = JSON.parse(JSON.stringify(worldStatesRef.current[id]));
    }
    pushToast({ kind: "save", text: `已复制 · ${copy.name}` });
  };

  const createWorld = ({ name, type, inspiration, seedKey }) => {
    const sd = window.MOCK.SEEDS[seedKey] || window.MOCK.SEEDS.memory;
    const newWorld = {
      id: "new_" + Date.now(),
      name: name || sd.suggestedName,
      type: type || sd.suggestedType,
      tags: sd.styles,
      summary: sd.coreSetting,
      maturity: 8,
      status: "draft",
      visibility: "private",
      archive: 0, seeds: 0, conflicts: 0,
      updated: "刚刚",
      mode: t.mode,
      isNew: true,
    };
    setWorlds(prev => [newWorld, ...prev]);
    setCurrentWorld(newWorld);
    setRecentlyCreatedId(newWorld.id);
    setMessages([
      { id: "u0", role: "user", text: inspiration },
    ]);
    setSavedSettings([]); setSavedSeeds([]); setSavedConflicts([]); setSavedIssues(sd.issues || []); setSavedIds([]);
    setView("workbench");
    // Kick off agent run with initial seed content
    setTimeout(() => startAgentRun(inspiration, true), 350);
  };

  // Save suggestion handler
  const handleSave = (item) => {
    if (savedIds.includes(item.id)) return;
    setSavedIds(prev => [...prev, item.id]);
    if (item.kind === "setting") {
      setSavedSettings(prev => [...prev, item]);
      pushToast({ kind: "save", text: `已保存到档案 · ${item.title}`, action: { label: "查看", onClick: () => setView("archive") } });
    } else if (item.kind === "seed") {
      setSavedSeeds(prev => [...prev, item]);
      pushToast({ kind: "save", text: `已保存到种子池 · ${item.title}`, action: { label: "查看", onClick: () => setView("seeds") } });
    } else if (item.kind === "conflict") {
      setSavedConflicts(prev => [...prev, item]);
      pushToast({ kind: "save", text: `已记入冲突池 · ${item.title}` });
    }
    // Update current world counters
    if (currentWorld) {
      setCurrentWorld(prev => ({
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

  const handleDiscard = (item) => {
    setSavedIds(prev => [...prev, item.id]);
    pushToast({ kind: "warn", text: `已丢弃 · ${item.title}` });
    setDrawerOpen(null);
  };

  // ────────── Issue triage (一致性问题) ──────────
  // 一条 issue 进入三选一：
  //   - 修：用户在 Archive 里去改对应设定，issue 标记为已解决
  //   - 留为冲突：issue 升格为冲突池里的「戏剧张力」
  //   - 弃：直接关闭，不再提示
  const handleResolveIssue = (issue) => {
    setSavedIssues(prev => prev.filter(x => x.id !== issue.id));
    pushToast({ kind: "save", text: `已标记为修复 · ${issue.title}` });
  };

  const handlePromoteIssueToConflict = (issue) => {
    setSavedIssues(prev => prev.filter(x => x.id !== issue.id));
    // Resolve involved setting IDs → titles for the relations field
    const involvedTitles = (issue.involves || [])
      .map(id => savedSettings.find(s => s.id === id))
      .filter(Boolean)
      .map(s => s.title);
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
    setSavedConflicts(prev => [...prev, newConflict]);
    pushToast({
      kind: "save",
      text: `已升格为冲突 · ${issue.title}`,
      action: { label: "查看", onClick: () => setView("conflicts") },
    });
  };

  const handleDiscardIssue = (issue) => {
    setSavedIssues(prev => prev.filter(x => x.id !== issue.id));
    pushToast({ kind: "warn", text: `已忽略 · ${issue.title}` });
  };

  // Pending items in current message stream
  const allSuggestions = useMemo(() => {
    const set = new Map();
    for (const m of messages) {
      if (m.suggestions) for (const s of m.suggestions) set.set(s.id, s);
    }
    return [...set.values()];
  }, [messages]);
  const pendingItems = useMemo(() => allSuggestions.filter(s => !savedIds.includes(s.id)), [allSuggestions, savedIds]);

  // ────────── Top-level render ──────────
  return (
    <div className="app">
      <StatusBar
        world={currentWorld && view !== "worlds" && view !== "create" && view !== "explore" ? currentWorld : null}
        mode={t.mode}
        balance={balance}
        tokens={runTokens}
        onMode={(m) => setTweak("mode", m)}
        onOpenPublish={() => pushToast({ text: "发布流程 P0 暂未在此原型实现", kind: "warn" })}
        onOpenCommunity={() => setView("explore")}
      />
      <div className="app-body">
        <Rail
          view={view}
          onNav={(v) => {
            if (v === "explore") setView("explore");
            else if (v === "worlds") setView("worlds");
            else if (currentWorld) setView(v);
            else setView("worlds");
          }}
          world={currentWorld && view !== "worlds" && view !== "create" && view !== "explore" ? currentWorld : null}
          pendingCount={pendingItems.length}
        />
        <main className="app-main" ref={mainRef} style={{ position: "relative", overflow: "hidden" }}>
          {view === "worlds" && (() => {
            const draftWorld = recentlyCreatedId ? worlds.find(w => w.id === recentlyCreatedId) : null;
            // Show as "savedDraft" hero card only while the world is still fresh (zero saves)
            const draftState = draftWorld ? worldStatesRef.current[draftWorld.id] : null;
            const isStillFresh = draftWorld && (!draftState || ((draftState.savedSettings?.length || 0) + (draftState.savedSeeds?.length || 0) + (draftState.savedConflicts?.length || 0) === 0));
            return (
              <WorldsView worlds={worlds} onOpen={openWorld}
                onCreate={(inspiration) => { setCreateInspiration(inspiration || ""); setView("create"); }}
                savedDraft={isStillFresh ? { name: draftWorld.name, coreSetting: draftWorld.summary, id: draftWorld.id } : null}
                onContinueDraft={continueDraft}
                onDelete={deleteWorld}
                onDuplicate={duplicateWorld}
                hideDraftFromList={isStillFresh ? draftWorld.id : null}
              />
            );
          })()}
          {view === "create" && (
            <CreateView initialInspiration={createInspiration} seedKey={t.seedKey}
              onConfirm={createWorld} onCancel={() => setView("worlds")}/>
          )}
          {view === "workbench" && currentWorld && (
            <Workbench
              world={currentWorld}
              messages={messages}
              agentMode={agentMode}
              agentBusy={agentBusy}
              savedIds={savedIds}
              pendingCount={pendingItems.length}
              onModeChange={(m) => {
                if (m !== agentMode) {
                  setAgentMode(m);
                  setModeFlash(m);
                  setTimeout(() => setModeFlash(cur => cur === m ? null : cur), 1600);
                }
              }}
              modeFlash={modeFlash}
              contextRefs={(() => {
                // Last completed agent message's contextRefs
                for (let i = messages.length - 1; i >= 0; i--) {
                  const m = messages[i];
                  if (m.role === "agent" && !m.streaming && m.contextRefs) return m.contextRefs;
                }
                return 0;
              })()}
              onSend={(text) => {
                setMessages(prev => [...prev, { id: "u_" + Date.now(), role: "user", text }]);
                setTimeout(() => startAgentRun(text, false), 200);
              }}
              onStop={stopAgent}
              onSave={handleSave}
              onOpenDetail={(s) => setDrawerOpen({ kind: "detail", item: s })}
              onOpenContext={() => setDrawerOpen({ kind: "context" })}
              onOpenSuggestions={() => setDrawerOpen({ kind: "pending" })}
            />
          )}
          {view === "archive" && currentWorld && (
            <ArchiveView world={currentWorld} savedSettings={savedSettings} savedIssues={savedIssues}
              onOpenDetail={(s) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onOpenIssues={(focusEntryId) => setDrawerOpen({ kind: "issues", focusEntryId })}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "seeds" && currentWorld && (
            <SeedsView world={currentWorld} savedSeeds={savedSeeds} savedConflicts={savedConflicts}
              onOpenDetail={(s) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onJumpToConflict={(c) => { setDrawerOpen(null); setView("conflicts"); setTimeout(() => setDrawerOpen({ kind: "detail", item: c, readonly: true }), 50); }}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "conflicts" && currentWorld && (
            <ConflictsView world={currentWorld} savedConflicts={savedConflicts} savedSeeds={savedSeeds}
              onOpenDetail={(s) => setDrawerOpen({ kind: "detail", item: s, readonly: true })}
              onBackToWorkbench={() => setView("workbench")}/>
          )}
          {view === "explore" && <ExplorePlaceholder onBack={() => setView("worlds")}/>}
          {view === "settings" && <SettingsPlaceholder onBack={() => setView("worlds")}/>}

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
                onJumpToItem={(targetItem) => {
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
                onOpenDetail={(s) => setDrawerOpen({ kind: "detail", item: s })}/>
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
                onJumpToEntry={(entry) => {
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
        <TweakRadio label="Mode" value={t.mode} options={["cloud", "local"]} onChange={v => setTweak("mode", v)}/>
        <TweakSelect label="灵感种子" value={t.seedKey} options={[
          { label: "记忆可以被买卖", value: "memory" },
          { label: "会说话的城市", value: "city" },
        ]} onChange={v => setTweak("seedKey", v)}/>
        <TweakSection label="排版 · TYPOGRAPHY"/>
        <TweakRadio label="对话密度" value={t.density} options={["compact", "regular", "comfy"]} onChange={v => setTweak("density", v)}/>
        <TweakRadio label="标题字体" value={t.titleFont} options={["sans", "serif"]} onChange={v => setTweak("titleFont", v)}/>
        <TweakSection label="主题 · THEME"/>
        <TweakRadio label="深浅" value={t.appTheme} options={["light", "dark"]} onChange={v => setTweak("appTheme", v)}/>
      </TweaksPanel>
    </div>
  );
}

// ────────── Workbench (composes Message + Composer) ──────────
const Workbench = ({
  world, messages, agentMode, agentBusy, savedIds, pendingCount,
  onModeChange, onSend, onStop, onSave, onOpenDetail,
  onOpenContext, onOpenSuggestions, modeFlash, contextRefs,
}) => {
  const scrollRef = useRef(null);
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
            {messages.map(m => (
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

const WorkbenchEmpty = ({ world }) => (
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

// ────────── Placeholder views (community / settings) ──────────
const ExplorePlaceholder = ({ onBack }) => (
  <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
    <div className="page-head">
      <div className="col">
        <div className="crumb">/ 界仓社区</div>
        <h1>Explore</h1>
        <div className="sub">公开世界仓库 · 浏览、Star、Fork</div>
      </div>
      <button className="btn ghost" onClick={onBack}>返回</button>
    </div>
    <div style={{ padding: "20px 32px" }}>
      <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--fg-2)" }}>
        <Icon name="community" size={28} style={{ color: "var(--fg-3)" }}/>
        <h3 style={{ marginTop: 10, color: "var(--fg-1)" }}>界仓社区在 P1 阶段实装</h3>
        <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, maxWidth: 460, margin: "6px auto 0" }}>
          本轮原型聚焦核心创作闭环：创建世界 → 工作台 → 沉淀为档案 / 种子。
          公开世界仓库（README、Releases、Fork 流程）将作为下一轮迭代。
        </p>
      </div>
    </div>
  </div>
);

const SettingsPlaceholder = ({ onBack }) => (
  <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
    <div className="page-head">
      <div className="col">
        <div className="crumb">/ settings</div>
        <h1>设置</h1>
      </div>
      <button className="btn ghost" onClick={onBack}>返回</button>
    </div>
    <div style={{ padding: "20px 32px" }}>
      <div className="card" style={{ padding: 24, color: "var(--fg-2)" }}>
        Local data / Model / Import / Export — 后续迭代。
      </div>
    </div>
  </div>
);

// ────────── Helper: follow-up agent responses ──────────
function getFollowUpResponse(mode, userText, seed) {
  const presets = {
    expand: `沿着这条线继续推：${userText.slice(0, 30)}…\n\n第一层：制度层面会自然衍生出**配套监管机制**。第二层：技术层面意味着记忆的"完整副本"是否合法——这是世界里最敏感的灰色地带。第三层：经济层面会形成新的阶级分层。\n\n要不要我从其中一层收束为可保存的设定？`,
    ask:    `让我先澄清两点：\n\n**1.** "${userText.slice(0, 24)}"——你倾向于让它发生在主流社会的明面上，还是黑市的暗面？\n\n**2.** 它和你之前确认的"虚空印记"机制是否需要协调？两者在你的世界里同时存在的话，会有一个非常具体的副作用值得展开。`,
    critique: `挑刺模式——这里我看到两个**需要修**的一致性问题：\n\n**问题一**：它和《记忆交易法》第 7 条的"情感剥离限制"对不上——按你目前的设定，亲属相关记忆不可交易，但你刚才提到的情境里有亲属介入。建议补一条例外条款，或者改情境。\n\n**问题二**：如果允许这种交易，"嵌合期" 90 天的撤销窗口会形成系统性套利空间——制度漏洞，需要堵。`,
    settle: `好，我把这段对话收束为可保存的设定：\n\n**标题候选**：记忆交易的合规边界\n**摘要**：在 ${userText.slice(0, 16)}… 的前提下，《记忆交易法》补充条款形成具体可执行的合规清单。\n\n下方建议卡里有完整正文，确认即可入档。`,
    consequence: `如果"${userText.slice(0, 18)}"成立，三个层级的后果会同时发生：\n\n**一年内**：记忆经纪人行业出现寡头化，三家头部记忆银行掌控 80% 的交易量。\n**五年内**：出现首批"完全由购买记忆构成"的人，他们的法律身份在司法实践中没有先例。\n**十年内**：教育体系崩塌——为什么要花 20 年学一门手艺，当你可以直接买？`,
    seed: `从你这个推演里我看到一个故事种子：\n\n**标题候选**：购买的师承\n**钩子**：当一个孩子可以直接买下大师 40 年的功夫记忆，"学徒制"这个词意味着什么？\n**核心冲突**：传承的本质是经验本身，还是经历经验的那个人？\n\n要把它存到种子池吗？`,
    tension: `找张力模式——我从你的设定里捞出一道**值得保留**的戏剧矛盾：\n\n**张力**：${userText.slice(0, 18)}…牵涉的是「**自由意志 vs 系统效率**」——这不是 bug，是世界的发电机。\n\n它能持续衍生关于反抗、合谋、隐忍、起义的具体故事。建议入冲突池，作为长期素材。`,
  };
  return presets[mode] || presets.expand;
}

// ────────── Mount ──────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
