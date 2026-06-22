// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryWorkbench } from "./story-workbench";
import * as api from "../worlddock/api";

describe("StoryWorkbench", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("creates the first chapter from an empty narrative", async () => {
    vi.spyOn(api, "getNarrative").mockResolvedValue({
      narrative: {
        id: "narrative_1",
        worldId: "world_1",
        title: "囚笼",
        synopsis: null,
        status: "draft",
        chapterCount: 0,
        assetCount: 0,
        metadata: {},
        visualStyle: {
          artDirection: "",
          characterBase: "",
          environmentBase: "",
          forbidden: [],
        },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
      chapters: [],
      assets: [],
    });
    vi.spyOn(api, "listProgressions").mockResolvedValue({ progressions: [] });
    const create = vi.spyOn(api, "createChapter").mockResolvedValue({
      chapter: {
        id: "chapter_1",
        narrativeId: "narrative_1",
        order: 1,
        title: "第一章",
        content: "",
        wordCount: 0,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "囚笼" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建章节" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith("narrative_1", {
        title: "第一章",
        content: "",
        status: "draft",
      });
    });
  });

  it("saves edits to the selected chapter", async () => {
    vi.spyOn(api, "getNarrative").mockResolvedValue({
      narrative: {
        id: "narrative_1",
        worldId: "world_1",
        title: "囚笼",
        synopsis: null,
        status: "in_progress",
        chapterCount: 1,
        assetCount: 0,
        metadata: {},
        visualStyle: {
          artDirection: "",
          characterBase: "",
          environmentBase: "",
          forbidden: [],
        },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
      chapters: [{
        id: "chapter_1",
        narrativeId: "narrative_1",
        order: 1,
        title: "醒来",
        content: "旧正文",
        wordCount: 3,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      }],
      assets: [],
    });
    vi.spyOn(api, "listProgressions").mockResolvedValue({ progressions: [] });
    const update = vi.spyOn(api, "updateChapter").mockResolvedValue({
      chapter: {
        id: "chapter_1",
        narrativeId: "narrative_1",
        order: 1,
        title: "醒来之后",
        content: "新正文",
        wordCount: 3,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    const editor = await screen.findByLabelText("章节正文");
    fireEvent.change(screen.getByLabelText("章节标题"), { target: { value: "醒来之后" } });
    fireEvent.change(editor, { target: { value: "新正文" } });
    fireEvent.click(screen.getByRole("button", { name: "保存章节" }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith("narrative_1", "chapter_1", {
        title: "醒来之后",
        content: "新正文",
        status: "draft",
      });
    });
  });

  it("keeps a newly created chapter selected before the narrative refetch returns", async () => {
    const staleNarrative = {
      narrative: {
        id: "narrative_1",
        worldId: "world_1",
        title: "囚笼",
        synopsis: null,
        status: "in_progress",
        chapterCount: 1,
        assetCount: 0,
        metadata: {},
        visualStyle: {
          artDirection: "",
          characterBase: "",
          environmentBase: "",
          forbidden: [],
        },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
      chapters: [{
        id: "chapter_1",
        narrativeId: "narrative_1",
        order: 1,
        title: "第一章",
        content: "旧正文",
        wordCount: 3,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      }],
      assets: [],
    };
    vi.spyOn(api, "getNarrative")
      .mockResolvedValueOnce(staleNarrative)
      .mockImplementation(() => new Promise<never>(() => undefined));
    vi.spyOn(api, "listProgressions").mockResolvedValue({ progressions: [] });
    vi.spyOn(api, "createChapter").mockResolvedValue({
      chapter: {
        id: "chapter_2",
        narrativeId: "narrative_1",
        order: 2,
        title: "第二章",
        content: "",
        wordCount: 0,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    });
    const update = vi.spyOn(api, "updateChapter").mockResolvedValue({
      chapter: {
        id: "chapter_2",
        narrativeId: "narrative_1",
        order: 2,
        title: "第二章",
        content: "",
        wordCount: 0,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "囚笼" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新建章节" }));

    await waitFor(() => {
      expect(screen.getByLabelText("章节标题")).toHaveValue("第二章");
    });
    fireEvent.click(screen.getByRole("button", { name: "保存章节" }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith("narrative_1", "chapter_2", {
        title: "第二章",
        content: "",
        status: "draft",
      });
    });
    expect(update).not.toHaveBeenCalledWith("narrative_1", "chapter_1", expect.anything());
  });

  it("renders chapters, writing editor, assets, and starts progression", async () => {
    vi.spyOn(api, "getNarrative").mockResolvedValue({
      narrative: {
        id: "narrative_1",
        worldId: "world_1",
        title: "雨巷档案",
        synopsis: "记忆会下雨。",
	        status: "in_progress",
	        chapterCount: 1,
	        assetCount: 1,
	        metadata: {},
	        visualStyle: {
	          artDirection: "水墨赛博雨夜",
	          characterBase: "低饱和灰蓝服装",
	          environmentBase: "潮湿石巷",
	          forbidden: ["卡通"],
	        },
	        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
      chapters: [{
        id: "chapter_1",
        narrativeId: "narrative_1",
        order: 1,
        title: "雨巷",
        content: "林晚抵达白塔城。",
        wordCount: 8,
        status: "completed",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      }],
      assets: [{
        id: "asset_1",
        narrativeId: "narrative_1",
        kind: "character",
        name: "林晚",
        summary: "迟到者。",
        body: null,
        tags: ["迟到者"],
        appearance: null,
	        mood: null,
	        visualPrompt: "水墨赛博雨夜；低饱和灰蓝服装；林晚",
	        nameEmbedding: null,
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      }],
	    });
	    vi.spyOn(api, "listProgressions").mockResolvedValue({
	      progressions: [{
	        id: "session_1",
	        worldId: "world_1",
	        kind: "story_progression",
	        status: "completed",
	        current: false,
	        title: "Progress 雨巷",
	        metadata: {
	          progressionOutput: {
	            assetChanges: [],
	            consistencyFlags: [],
	            narrativeObservations: [{
	              observation: "第一章完成 setup。",
	              implication: "城市异常已经进入主线。",
	              arcStage: "setup",
	              emotionScore: -0.2,
	            }],
	            worldSnapshot: {
	              timestamp: "after chapter 1",
	              activeCharacters: [{ name: "林晚", location: "白塔城", status: "抵达" }],
	              unresolvedConflicts: ["报时塔异常"],
	              ongoingEvents: ["雨巷调查"],
	            },
	          },
	        },
	        createdAt: "2026-06-22T00:00:00.000Z",
	        updatedAt: "2026-06-22T00:00:00.000Z",
	      } as any],
	    });
    const start = vi.spyOn(api, "startChapterProgression").mockResolvedValue({
      sessionId: "session_1",
      session: { id: "session_1", worldId: "world_1", kind: "story_progression", status: "active" } as any,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "雨巷档案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /雨巷/ })).toBeInTheDocument();
    expect(screen.getByLabelText("章节正文")).toHaveValue("林晚抵达白塔城。");
    expect(screen.getByText("林晚")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /推演本章/ }));
    await waitFor(() => {
	      expect(start).toHaveBeenCalledWith("narrative_1", "chapter_1");
	    });
	    expect(await screen.findByText(/推演已创建/)).toBeInTheDocument();

	    fireEvent.click(screen.getByRole("tab", { name: "视觉" }));
	    expect(screen.getByText("水墨赛博雨夜")).toBeInTheDocument();
	    fireEvent.click(screen.getByRole("tab", { name: "快照" }));
	    expect(screen.getByText(/林晚 · 白塔城 · 抵达/)).toBeInTheDocument();
	    fireEvent.click(screen.getByRole("tab", { name: "弧光" }));
	    expect(screen.getByText("setup")).toBeInTheDocument();
	    expect(screen.getByText("第一章完成 setup。")).toBeInTheDocument();
	  });
	});
