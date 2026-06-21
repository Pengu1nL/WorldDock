# Phase 2: Agent Integration + CEO Expansions

## Context

Phase 1 delivered data model, API, and frontend skeleton. Phase 2 makes the agent
actually work.

**Working tree**: `codex/story-first-pivot` (uncommitted changes in worktree)

## 1. Fix N+1 in `applyRelationChanges`

`apps/api/src/modules/narratives/narratives.service.ts:331-348`

Current: `listAssets(narrativeId)` called inside `relationChanges` loop.
Fix: pull assets once before the loop.

## 2. Real Agent Progression (replaces stub)

Current `startProgression` accepts pre-built `ProgressionOutput` from the frontend.
Replace with:

1. `POST /narratives/:nid/chapters/:cid/progress` → creates AgentSession (kind:
   `story_progression`) with status `active`, returns `{ sessionId }`
2. Agent runs asynchronously (use existing agent infrastructure in
   `apps/api/src/modules/agent/`):
   - **Progressive disclosure tools**: `list_characters(narrativeId)`,
     `get_asset(narrativeId, assetId)`,
     `get_previous_chapter_snapshot(narrativeId, chapterOrder)`
   - Agent reads current chapter, calls tools as needed, outputs
     `ProgressionOutput` JSON
3. Agent output is stored in `session.metadata.progressionOutput`,
   `reviewStatus` set to `pending_review`
4. Frontend polls `GET /narratives/:nid/progressions/:sid` until
   `reviewStatus !== "running"`
5. Existing confirm/reject flow unchanged

**Agent system prompt**: see `apps/api/src/modules/agent/pi/` for existing prompt
patterns. Add `story_progression` system prompt that instructs the agent to:
- Read the chapter content from the session context
- Use tools to query existing assets and previous chapter state
- Output structured `ProgressionOutput` JSON
- Do NOT invent facts not in the text

## 3. Vector-based Asset Dedup

When `applyAssetChange` creates a new asset, compute a name embedding and store
in `nameEmbedding`. Before creating, check against existing assets with same kind
for cosine similarity > 0.85 — if match found, suggest merge instead of create.

Use the same embedding approach as the existing codebase (check if there's an
embedding utility already, or use a lightweight approach: TF-IDF on character
n-grams for Chinese + word-level for English).

## 4. Visual Style Guide (CEO expansion)

Add to Narrative model:
- `visualStyle Json @default("{}")` — `{ artDirection, characterBase,
  environmentBase, forbidden }`

When agent generates `ProgressionOutput.assetChanges`, include `visualPrompt`
that combines `narrative.visualStyle` constraints with asset-specific details.

## 5. World Snapshot (CEO expansion)

After progression is confirmed, generate a `WorldSnapshot` stored in
`narrative.metadata.worldSnapshot`:

```typescript
type WorldSnapshot = {
  timestamp: string;        // after which chapter
  activeCharacters: { name: string; location: string; status: string }[];
  unresolvedConflicts: string[];
  ongoingEvents: string[];
};
```

Agent generates this as part of ProgressionOutput. Frontend displays it in the
progression panel.

## 6. Narrative Arc View (CEO expansion)

Frontend only. In the progression panel, add a tab that shows:
- Chapter positions on a story arc (setup/rising/climax/falling/resolution)
- Emotion curve based on chapter content analysis
- Agent provides this in `ProgressionOutput.narrativeObservations`

## Verification

After each step:
```bash
pnpm --filter @worlddock/api test -- test/narratives.spec.ts
pnpm --filter @worlddock/api test:integration
```

## Files to touch

- `apps/api/src/modules/narratives/narratives.service.ts` — N+1 fix, agent integration
- `apps/api/src/modules/narratives/narratives.controller.ts` — maybe for polling
- `apps/api/src/modules/agent/` — story_progression prompt + tools
- `apps/api/src/modules/agent-sessions/` — maybe for async session mgmt
- `apps/web/src/features/narratives/story-workbench.tsx` — arc view, snapshot panel
- `apps/web/src/features/worlddock/api.ts` — new types if needed
- `packages/db/prisma/schema.prisma` — visualStyle on Narrative
- `packages/contract/` — new Zod schemas if needed
