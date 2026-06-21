# WorldDock

Agent-assisted story development tool. Write stories — world assets accumulate from the narrative.

## Tech Stack

- **API**: NestJS (TypeScript), Prisma (PostgreSQL), Zod validation
- **Web**: Next.js App Router, React 18, TanStack Query, CSS Modules
- **Agent**: LLM-powered multi-turn tool-use sessions
- **Repo**: pnpm monorepo — `apps/api`, `apps/web`, `packages/*`
- **Tests**: Vitest (API integration + web unit), Playwright (E2E)
- **Package manager**: pnpm ≥ 10

## Project Structure

```
apps/
  api/src/modules/
    worlds/           — World CRUD
    world-assets/     — Asset CRUD (ArchiveEntry, StorySeed, Conflict)
    agent/            — Agent orchestration (LLM calls, prompt assembly)
    agent-sessions/   — Session lifecycle + message persistence
    consistency/      — Cross-asset consistency checks
    official-assets/  — Official asset patches + revisions
    exports/          — World package export
  web/src/
    app/              — Next.js App Router pages
    features/
      worlddock/      — API client + shared shell components
      world-assets/   — Asset listing/editing UI
      agent-sessions/ — Agent session panel
      consistency/    — Consistency issue triage

packages/
  contract/           — Zod schemas + shared types (build before using)
  db/                 — Prisma schema + generated client
  domain/             — Domain types
  config/             — Shared config
  logger/             — Logging
  worlddock-cli/      — CLI binary for package export/import
```

## Conventions

### Prisma Schema
- IDs: `@id @default(cuid())`
- Table names: `@map("snake_case")`
- Indexes: `@@index([field])`
- Relations: `onDelete: Cascade` on child models
- Enums: PascalCase values in schema, string unions in TypeScript
- Generated client output: `packages/db/src/generated/prisma/`

### NestJS Modules
- Repository pattern: `Symbol("XXX_REPOSITORY")` injection token, PrismaXxxRepository class
- Module file at `apps/api/src/modules/<name>/<name>.module.ts`
- Controller + Service + Repository per module
- Use `@Injectable()`, constructor DI with token injection
- Explicit `@Inject(SYMBOL)` for class providers where Nest can't auto-resolve
- Integration tests in `apps/api/test/*.integration-spec.ts`
- Test helpers in `apps/api/test/local-api-test-helpers.ts`

### API Client (Web→API)
- Centralized in `apps/web/src/features/worlddock/api.ts`
- Types and fetch wrappers exported from one module
- React Query hooks in `apps/web/src/features/<domain>/use-*.ts`

### Frontend
- Feature folders under `apps/web/src/features/`
- TanStack Query for server state, `useMutation`/`useQuery` patterns
- Query key factories: `export const xKeys = { all: [...], detail: (id) => [...] }`
- Next.js App Router — pages in `apps/web/src/app/`

### Agent Sessions
- Session kinds: `world_exploration`, `asset_edit`, `consistency_repair`, `story_progression` (planned)
- Structured output via typed JSON schemas
- Messages stored with role/sequence/status
- Subjects and context items link sessions to domain objects

## Commands

```bash
pnpm setup              # First-time setup (env, DB, deps)
pnpm dev                # Start API + Web in parallel
pnpm build              # Clean + build all packages
pnpm test               # Run all unit/integration tests
pnpm test:e2e           # Run Playwright E2E tests
pnpm lint               # Lint all packages
pnpm verify             # Full check: lint + test + build
pnpm verify:ci          # CI check: generate + lint + test + integration + E2E

# Package-specific
pnpm --filter @worlddock/api test:integration   # API integration tests
pnpm --filter @worlddock/web test:e2e           # Web E2E tests
pnpm --filter @worlddock/contract build         # Build contract package
pnpm --filter @worlddock/db prisma:generate     # Regenerate Prisma client
```

## Testing

- **API integration tests**: `apps/api/test/` — Vitest, spin up test server, hit real endpoints
- **Web unit tests**: `apps/web/src/**/*.test.tsx` — Vitest + React Testing Library
- **E2E**: `apps/web/e2e/` — Playwright, headless Chromium
- Test naming: `*.integration-spec.ts` (API), `*.test.tsx` (web components), `*.spec.ts` (E2E)
- Mock agent responses in tests using fixture JSON

## Current Design

Active design doc: `docs/designs/story-first-pivot.md`

The project is pivoting from "agent-assisted world exploration" to **narrative-first story development**. Key architecture decisions:

1. **Narrative** is the primary entity (top-level `/api/narratives`)
2. **World** is a lightweight container for narratives
3. **NarrativeAsset** is a derived projection — created by agent from story content, not manually
4. **Agent progression** uses progressive disclosure (multi-turn tool-use, not single LLM call)
5. **ProgressionRun** folds into existing AgentSession infrastructure
6. Asset dedup uses embedding vectors (name unique constraint removed)
7. Progression is async (POST → sessionId → poll for results)

See `docs/designs/story-first-pivot.md` for the full data model, API design, and implementation plan.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
