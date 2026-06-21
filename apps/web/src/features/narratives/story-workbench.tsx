"use client";

import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../worlddock/components";
import * as worlddockApi from "../worlddock/api";
import type { Chapter, NarrativeAsset, ProgressionOutput, VisualStyleGuide, WorldSnapshot } from "../worlddock/api";

const routeQueryClient = new QueryClient();

export function StoryWorkbenchRoute({ narrativeId }: { narrativeId: string }) {
  return (
    <QueryClientProvider client={routeQueryClient}>
      <StoryWorkbench narrativeId={narrativeId} />
    </QueryClientProvider>
  );
}

export function StoryWorkbench({ narrativeId }: { narrativeId: string }) {
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<"assets" | "snapshot" | "arc" | "style">("assets");

  const narrativeQuery = useQuery({
    queryKey: ["narrative", narrativeId],
    queryFn: () => worlddockApi.getNarrative(narrativeId),
  });
  const progressionsQuery = useQuery({
    queryKey: ["narrative-progressions", narrativeId],
    queryFn: () => worlddockApi.listProgressions(narrativeId),
  });

  const chapters = narrativeQuery.data?.chapters ?? [];
  const assets = narrativeQuery.data?.assets ?? [];
  const latestProgressionOutput = useMemo(
    () => readLatestProgressionOutput(progressionsQuery.data?.progressions ?? []),
    [progressionsQuery.data?.progressions],
  );
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null,
    [chapters, selectedChapterId],
  );

  useEffect(() => {
    if (!selectedChapter) return;
    setSelectedChapterId(selectedChapter.id);
    setDraftContent(selectedChapter.content);
  }, [selectedChapter?.id]);

  const startProgression = useMutation({
    mutationFn: async (chapter: Chapter) => worlddockApi.startChapterProgression(narrativeId, chapter.id),
    onSuccess: async (result) => {
      setNotice(`推演已创建 · ${result.sessionId}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["narrative", narrativeId] }),
        queryClient.invalidateQueries({ queryKey: ["narrative-progressions", narrativeId] }),
      ]);
    },
  });

  if (narrativeQuery.isPending) {
    return <main style={{ padding: 24 }} role="status">正在读取故事...</main>;
  }

  if (narrativeQuery.isError || !narrativeQuery.data) {
    return <main style={{ padding: 24 }} role="status">故事暂不可用。</main>;
  }

  const { narrative } = narrativeQuery.data;
  const worldSnapshot = readWorldSnapshot(narrative.metadata.worldSnapshot) ?? latestProgressionOutput?.worldSnapshot ?? null;
  const arcObservations = latestProgressionOutput?.narrativeObservations ?? [];

  return (
    <main style={{
      height: "100vh",
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr)",
      background: "var(--bg)",
      color: "var(--fg)",
    }}>
      <header style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--hairline)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="title-font" style={{ fontSize: "var(--t-20)", margin: 0 }}>{narrative.title}</h1>
          <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11, marginTop: 3 }}>
            {narrative.chapterCount} chapters · {narrative.assetCount} assets · {narrative.status}
          </div>
        </div>
        <div className="row gap-2">
          {notice && <span className="badge sage">{notice}</span>}
          <button
            className="btn primary"
            disabled={!selectedChapter || startProgression.isPending}
            onClick={() => selectedChapter && startProgression.mutate(selectedChapter)}
          >
            <Icon name="spark" size={13} />
            <span>{startProgression.isPending ? "推演中" : "推演本章"}</span>
          </button>
        </div>
      </header>

      <section style={{
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "240px minmax(360px, 1fr) 320px",
      }}>
        <aside style={{ borderRight: "1px solid var(--hairline)", padding: 12, overflow: "auto" }}>
          <div className="label" style={{ marginBottom: 8 }}>章节</div>
          <div className="col" style={{ gap: 6 }}>
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                className={`sb-btn ${chapter.id === selectedChapter?.id ? "primary" : ""}`}
                onClick={() => setSelectedChapterId(chapter.id)}
                style={{ justifyContent: "flex-start", width: "100%", minHeight: 34 }}
              >
                <span className="mono">{chapter.order}</span>
                <span>{chapter.title}</span>
              </button>
            ))}
          </div>
        </aside>

        <section style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--hairline)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}>
            <div>
              <div className="title-font" style={{ fontSize: "var(--t-16)", fontWeight: 650 }}>
                {selectedChapter?.title ?? "选择章节"}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3 }}>
                {selectedChapter ? `${selectedChapter.wordCount} words · ${selectedChapter.status}` : "no chapter"}
              </div>
            </div>
          </div>
          <textarea
            aria-label="章节正文"
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            style={{
              width: "100%",
              height: "100%",
              resize: "none",
              border: 0,
              outline: "none",
              padding: "20px 22px",
              background: "var(--bg)",
              color: "var(--fg)",
              fontFamily: "var(--font-serif)",
              fontSize: 17,
              lineHeight: 1.8,
            }}
          />
        </section>

        <aside style={{ borderLeft: "1px solid var(--hairline)", padding: 12, overflow: "auto" }}>
          <div role="tablist" aria-label="推演面板" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10 }}>
            {[
              ["assets", "资产"],
              ["snapshot", "快照"],
              ["arc", "弧光"],
              ["style", "视觉"],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={panel === id}
                className={`sb-btn ${panel === id ? "primary" : ""}`}
                onClick={() => setPanel(id as typeof panel)}
                style={{ minHeight: 30, justifyContent: "center" }}
              >
                {label}
              </button>
            ))}
          </div>
          {panel === "assets" && <AssetsPanel assets={assets} />}
          {panel === "snapshot" && <WorldSnapshotPanel snapshot={worldSnapshot} />}
          {panel === "arc" && <NarrativeArcPanel observations={arcObservations} chapters={chapters} />}
          {panel === "style" && <VisualStylePanel visualStyle={narrative.visualStyle} />}
        </aside>
      </section>
    </main>
  );
}

function AssetsPanel({ assets }: { assets: NarrativeAsset[] }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      {assets.length === 0 ? (
        <div style={{ color: "var(--fg-2)", fontSize: 13, lineHeight: 1.6 }}>推演确认后，角色、地点和设定会出现在这里。</div>
      ) : assets.map((asset) => <AssetRow key={asset.id} asset={asset} />)}
    </div>
  );
}

function AssetRow({ asset }: { asset: NarrativeAsset }) {
  return (
    <article style={{
      padding: "9px 10px",
      border: "1px solid var(--hairline)",
      borderRadius: 6,
      background: "var(--surface)",
    }}>
      <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <strong style={{ fontSize: 13 }}>{asset.name}</strong>
        <span className="badge">{asset.kind}</span>
      </div>
      <p style={{ margin: "6px 0 0", color: "var(--fg-2)", fontSize: 12, lineHeight: 1.55 }}>{asset.summary}</p>
      {asset.visualPrompt && (
        <p style={{ margin: "6px 0 0", color: "var(--fg-3)", fontSize: 11, lineHeight: 1.5 }}>{asset.visualPrompt}</p>
      )}
    </article>
  );
}

function WorldSnapshotPanel({ snapshot }: { snapshot: WorldSnapshot | null }) {
  if (!snapshot) return <EmptyPanelText>暂无世界快照。</EmptyPanelText>;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>{snapshot.timestamp}</div>
      <PanelBlock title="活跃角色">
        {snapshot.activeCharacters.length === 0 ? "暂无" : snapshot.activeCharacters.map((character) =>
          `${character.name} · ${character.location || "未知位置"} · ${character.status || "未知状态"}`
        ).join("\n")}
      </PanelBlock>
      <PanelBlock title="未解冲突">{snapshot.unresolvedConflicts.join("\n") || "暂无"}</PanelBlock>
      <PanelBlock title="进行中事件">{snapshot.ongoingEvents.join("\n") || "暂无"}</PanelBlock>
    </div>
  );
}

function NarrativeArcPanel({ observations, chapters }: { observations: ProgressionOutput["narrativeObservations"]; chapters: Chapter[] }) {
  if (observations.length === 0) return <EmptyPanelText>暂无叙事弧光。</EmptyPanelText>;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(chapters.length, 1)}, minmax(22px, 1fr))`, gap: 4 }}>
        {chapters.map((chapter) => (
          <div key={chapter.id} title={chapter.title} style={{ height: 6, borderRadius: 3, background: "var(--hairline)" }} />
        ))}
      </div>
      {observations.map((observation, index) => (
        <article key={`${observation.observation}-${index}`} style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: 9, background: "var(--surface)" }}>
          <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 12 }}>{observation.arcStage ?? "arc"}</strong>
            {typeof observation.emotionScore === "number" && <span className="mono" style={{ fontSize: 11 }}>{observation.emotionScore.toFixed(2)}</span>}
          </div>
          {typeof observation.emotionScore === "number" && (
            <div style={{ height: 6, background: "var(--hairline)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.max(0, Math.min(100, ((observation.emotionScore + 1) / 2) * 100))}%`,
                background: "var(--accent)",
              }} />
            </div>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.55 }}>{observation.observation}</p>
          <p style={{ margin: "5px 0 0", color: "var(--fg-2)", fontSize: 12, lineHeight: 1.55 }}>{observation.implication}</p>
        </article>
      ))}
    </div>
  );
}

function VisualStylePanel({ visualStyle }: { visualStyle: VisualStyleGuide }) {
  const forbidden = Array.isArray(visualStyle.forbidden) ? visualStyle.forbidden.filter((item): item is string => typeof item === "string") : [];
  return (
    <div className="col" style={{ gap: 10 }}>
      <PanelBlock title="Art Direction">{readStyleText(visualStyle.artDirection) || "未设置"}</PanelBlock>
      <PanelBlock title="Character Base">{readStyleText(visualStyle.characterBase) || "未设置"}</PanelBlock>
      <PanelBlock title="Environment Base">{readStyleText(visualStyle.environmentBase) || "未设置"}</PanelBlock>
      <PanelBlock title="Forbidden">{forbidden.join("\n") || "未设置"}</PanelBlock>
    </div>
  );
}

function PanelBlock({ title, children }: { title: string; children: string }) {
  return (
    <section style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: 9, background: "var(--surface)" }}>
      <div className="label" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ whiteSpace: "pre-wrap", color: "var(--fg-2)", fontSize: 12, lineHeight: 1.55 }}>{children}</div>
    </section>
  );
}

function EmptyPanelText({ children }: { children: string }) {
  return <div style={{ color: "var(--fg-2)", fontSize: 13, lineHeight: 1.6 }}>{children}</div>;
}

function readLatestProgressionOutput(progressions: worlddockApi.AgentSession[]): ProgressionOutput | null {
  for (const progression of progressions) {
    const output = readProgressionOutput(progression.metadata?.progressionOutput);
    if (output) return output;
  }
  return null;
}

function readProgressionOutput(value: unknown): ProgressionOutput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = value as ProgressionOutput;
  return Array.isArray(output.narrativeObservations) ? output : null;
}

function readWorldSnapshot(value: unknown): WorldSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as WorldSnapshot;
  return typeof snapshot.timestamp === "string" ? snapshot : null;
}

function readStyleText(value: unknown) {
  return typeof value === "string" ? value : "";
}
