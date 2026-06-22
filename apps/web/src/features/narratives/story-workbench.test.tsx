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

  it("saves the draft before starting chapter progression", async () => {
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
        title: "醒来",
        content: "新正文",
        wordCount: 3,
        status: "draft",
        metadata: {},
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
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

    const editor = await screen.findByLabelText("章节正文");
    fireEvent.change(editor, { target: { value: "新正文" } });
    fireEvent.click(screen.getByRole("button", { name: /推演本章/ }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith("narrative_1", "chapter_1", {
        title: "醒来",
        content: "新正文",
        status: "draft",
      });
      expect(start).toHaveBeenCalledWith("narrative_1", "chapter_1");
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
    });
  });

  it("keeps polling while any progression is running", async () => {
    vi.useFakeTimers();
    try {
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
      const list = vi.spyOn(api, "listProgressions").mockResolvedValue({
        progressions: [{
          id: "session_latest",
          worldId: "world_1",
          kind: "story_progression",
          status: "completed",
          current: false,
          title: "Progress latest",
          metadata: {
            reviewStatus: "pending_review",
            progressionOutput: {
              assetChanges: [],
              consistencyFlags: [],
              narrativeObservations: [{
                observation: "最新推演已待确认。",
                implication: "旧推演仍在运行。",
                arcStage: "setup",
              }],
            },
          },
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:02.000Z",
        } as any, {
          id: "session_running",
          worldId: "world_1",
          kind: "story_progression",
          status: "active",
          current: true,
          title: "Progress running",
          metadata: {
            reviewStatus: "running",
          },
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:01.000Z",
        } as any],
      });

      render(
        <QueryClientProvider client={new QueryClient()}>
          <StoryWorkbench narrativeId="narrative_1" />
        </QueryClientProvider>,
      );

      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(list).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1600);
      await Promise.resolve();
      await Promise.resolve();

      expect(list).toHaveBeenCalledTimes(2);
      expect(screen.getByText("推演运行中")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls running progression until it is pending review", async () => {
    vi.useFakeTimers();
    try {
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
      const list = vi.spyOn(api, "listProgressions")
        .mockResolvedValueOnce({
          progressions: [{
            id: "session_1",
            worldId: "world_1",
            kind: "story_progression",
            status: "active",
            current: true,
            title: "Progress 醒来",
            metadata: {
              reviewStatus: "running",
            },
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z",
          } as any],
        })
        .mockResolvedValue({
          progressions: [{
            id: "session_1",
            worldId: "world_1",
            kind: "story_progression",
            status: "completed",
            current: false,
            title: "Progress 醒来",
            metadata: {
              reviewStatus: "pending_review",
              progressionOutput: {
                assetChanges: [],
                consistencyFlags: [],
                narrativeObservations: [{
                  observation: "囚笼主题被建立。",
                  implication: "主线进入 setup。",
                  arcStage: "setup",
                }],
              },
            },
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:01.000Z",
          } as any],
        });

      render(
        <QueryClientProvider client={new QueryClient()}>
          <StoryWorkbench narrativeId="narrative_1" />
        </QueryClientProvider>,
      );

      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(list).toHaveBeenCalledTimes(1);
      expect(screen.getByText("推演运行中")).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(1600);
      await Promise.resolve();
      await Promise.resolve();

      expect(list).toHaveBeenCalledTimes(2);
      expect(screen.getByText("待确认推演")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables progression while a chapter save is pending", async () => {
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
    const savedChapter = {
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
    };
    let resolveUpdate: (value: { chapter: typeof savedChapter }) => void = () => undefined;
    const update = vi.spyOn(api, "updateChapter").mockImplementation(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    const start = vi.spyOn(api, "startChapterProgression").mockResolvedValue({
      sessionId: "session_1",
      session: { id: "session_1", worldId: "world_1", kind: "story_progression", status: "active" } as any,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("章节正文")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存章节" }));

    try {
      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: /推演本章/ })).toBeDisabled();
      });
      fireEvent.click(screen.getByRole("button", { name: /推演本章/ }));
      expect(start).not.toHaveBeenCalled();
    } finally {
      resolveUpdate({ chapter: savedChapter });
    }
  });

  it("does not show the review card when the latest pending review progression has no output", async () => {
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
    vi.spyOn(api, "listProgressions").mockResolvedValue({
      progressions: [{
        id: "session_latest",
        worldId: "world_1",
        kind: "story_progression",
        status: "completed",
        current: false,
        title: "Progress latest",
        metadata: {
          reviewStatus: "pending_review",
        },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:02.000Z",
      } as any, {
        id: "session_old",
        worldId: "world_1",
        kind: "story_progression",
        status: "completed",
        current: false,
        title: "Progress old",
        metadata: {
          reviewStatus: "confirmed",
          progressionOutput: {
            assetChanges: [],
            consistencyFlags: [],
            narrativeObservations: [{
              observation: "旧弧光仍可展示。",
              implication: "普通面板保留旧 output fallback。",
              arcStage: "setup",
            }],
          },
        },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:01.000Z",
      } as any],
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "囚笼" })).toBeInTheDocument();
    expect(screen.queryByText("待确认推演")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "弧光" }));
    expect(screen.getByText("旧弧光仍可展示。")).toBeInTheDocument();
  });

  it.each(["running", "failed"] as const)(
    "keeps an older pending review progression visible when a newer %s progression has no output",
    async (newerReviewStatus) => {
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
      vi.spyOn(api, "listProgressions").mockResolvedValue({
        progressions: [{
          id: "session_newer",
          worldId: "world_1",
          kind: "story_progression",
          status: newerReviewStatus === "running" ? "active" : "failed",
          current: newerReviewStatus === "running",
          title: "Progress newer",
          metadata: {
            reviewStatus: newerReviewStatus,
          },
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:03.000Z",
        } as any, {
          id: "session_pending",
          worldId: "world_1",
          kind: "story_progression",
          status: "completed",
          current: false,
          title: "Progress pending",
          metadata: {
            reviewStatus: "pending_review",
            progressionOutput: {
              assetChanges: [],
              consistencyFlags: [],
              narrativeObservations: [{
                observation: "旧待确认推演仍应出现。",
                implication: "用户需要先确认或拒绝它。",
                arcStage: "setup",
              }],
            },
          },
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:01.000Z",
        } as any],
      });

      render(
        <QueryClientProvider client={new QueryClient()}>
          <StoryWorkbench narrativeId="narrative_1" />
        </QueryClientProvider>,
      );

      expect(await screen.findByText("待确认推演")).toBeInTheDocument();
      expect(screen.getByText("session_pending")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "确认推演" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "拒绝推演" })).toBeInTheDocument();
    },
  );

  it("confirms a pending review progression and refreshes accepted assets", async () => {
    const chapter = {
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
    };
    const baseNarrative = {
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
    };
    vi.spyOn(api, "getNarrative")
      .mockResolvedValueOnce({
        narrative: baseNarrative,
        chapters: [chapter],
        assets: [],
      })
      .mockResolvedValue({
        narrative: {
          ...baseNarrative,
          assetCount: 1,
          metadata: {
            worldSnapshot: {
              timestamp: "after chapter 1",
              activeCharacters: [{ name: "囚徒甲", location: "囚笼", status: "醒来" }],
              unresolvedConflicts: [],
              ongoingEvents: ["囚徒甲醒来"],
            },
          },
        },
        chapters: [chapter],
        assets: [{
          id: "asset_1",
          narrativeId: "narrative_1",
          kind: "character",
          name: "囚徒甲",
          summary: "在囚笼中醒来的角色。",
          body: null,
          tags: [],
          appearance: null,
          mood: null,
          visualPrompt: null,
          nameEmbedding: null,
          metadata: {},
          createdAt: "2026-06-22T00:00:01.000Z",
          updatedAt: "2026-06-22T00:00:01.000Z",
        }],
      });
    const pendingProgression = {
      id: "session_1",
      worldId: "world_1",
      kind: "story_progression",
      status: "completed",
      current: false,
      title: "Progress 醒来",
      metadata: {
        reviewStatus: "pending_review",
        progressionOutput: {
          assetChanges: [{
            kind: "character",
            name: "囚徒甲",
            summary: "在囚笼中醒来的角色。",
          }],
          consistencyFlags: [],
          narrativeObservations: [{
            observation: "囚徒甲在囚笼中醒来。",
            implication: "角色资产等待确认入库。",
            arcStage: "setup",
          }],
        },
      },
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:01.000Z",
    } as any;
    const list = vi.spyOn(api, "listProgressions")
      .mockResolvedValueOnce({ progressions: [pendingProgression] })
      .mockResolvedValue({
        progressions: [{
          ...pendingProgression,
          metadata: {
            reviewStatus: "confirmed",
          },
        }],
      });
    const confirm = vi.spyOn(api, "confirmProgression").mockResolvedValue({
      session: { id: "session_1", metadata: { reviewStatus: "confirmed" } } as any,
      appliedAssets: [],
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("待确认推演")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认推演" }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith("narrative_1", "session_1");
    });
    expect(await screen.findByText("囚徒甲")).toBeInTheDocument();
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("待确认推演")).not.toBeInTheDocument();
    });
  });

  it("blocks starting a new progression while confirmation is pending", async () => {
    const chapter = {
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
    };
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
      chapters: [chapter],
      assets: [],
    });
    vi.spyOn(api, "listProgressions").mockResolvedValue({
      progressions: [{
        id: "session_1",
        worldId: "world_1",
        kind: "story_progression",
        status: "completed",
        current: false,
        title: "Progress 醒来",
        metadata: {
          reviewStatus: "pending_review",
          progressionOutput: {
            assetChanges: [],
            consistencyFlags: [],
            narrativeObservations: [{
              observation: "囚徒甲在囚笼中醒来。",
              implication: "角色资产等待确认入库。",
              arcStage: "setup",
            }],
          },
        },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:01.000Z",
      } as any],
    });
    let resolveConfirm: (value: { session: any; appliedAssets: [] }) => void = () => undefined;
    vi.spyOn(api, "confirmProgression").mockImplementation(() => new Promise((resolve) => {
      resolveConfirm = resolve;
    }));
    vi.spyOn(api, "updateChapter").mockResolvedValue({ chapter });
    const start = vi.spyOn(api, "startChapterProgression").mockResolvedValue({
      sessionId: "session_2",
      session: { id: "session_2", worldId: "world_1", kind: "story_progression", status: "active" } as any,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("待确认推演")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认推演" }));

    const progressionButton = screen.getByRole("button", { name: /推演本章/ });
    await waitFor(() => {
      expect(progressionButton).toBeDisabled();
    });
    fireEvent.click(progressionButton);
    expect(start).not.toHaveBeenCalled();

    resolveConfirm({
      session: { id: "session_1", metadata: { reviewStatus: "confirmed" } } as any,
      appliedAssets: [],
    });
  });

  it("rejects a pending review progression without applying assets", async () => {
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
    vi.spyOn(api, "listProgressions")
      .mockResolvedValueOnce({
        progressions: [{
          id: "session_1",
          worldId: "world_1",
          kind: "story_progression",
          status: "completed",
          current: false,
          title: "Progress 醒来",
          metadata: {
            reviewStatus: "pending_review",
            progressionOutput: {
              assetChanges: [{
                kind: "character",
                name: "囚徒甲",
                summary: "在囚笼中醒来的角色。",
              }],
              consistencyFlags: [],
              narrativeObservations: [{
                observation: "囚徒甲在囚笼中醒来。",
                implication: "角色资产等待确认入库。",
                arcStage: "setup",
              }],
            },
          },
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:01.000Z",
        } as any],
      })
      .mockResolvedValue({
        progressions: [{
          id: "session_1",
          worldId: "world_1",
          kind: "story_progression",
          status: "completed",
          current: false,
          title: "Progress 醒来",
          metadata: {
            reviewStatus: "rejected",
          },
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:01.000Z",
        } as any],
      });
    const reject = vi.spyOn(api, "rejectProgression").mockResolvedValue({
      session: { id: "session_1", metadata: { reviewStatus: "rejected" } } as any,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoryWorkbench narrativeId="narrative_1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("待确认推演")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "拒绝推演" }));

    await waitFor(() => {
      expect(reject).toHaveBeenCalledWith("narrative_1", "session_1");
    });
    expect(await screen.findByText("推演已拒绝")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("待确认推演")).not.toBeInTheDocument();
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
    vi.spyOn(api, "updateChapter").mockResolvedValue({
      chapter: {
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
      },
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
