# Pi Upstream Audit

Source repository: https://github.com/earendil-works/pi
Local source tree: `/Users/luohaodong/Documents/CodeBase/pi`
Local source status: present; no `.git` directory was present during audit.
Pinned remote commit: `4bbe2959bd93e00d29bdc3cfde71d50e47e80133`

Use only APIs confirmed in this audit when implementing Phase 5.

## Confirmed Packages

- Local root package: `pi-monorepo` `0.0.3`
- `@earendil-works/pi-agent-core` `0.75.5`
- `@earendil-works/pi-ai` `0.75.5`
- Node engine: `>=22.19.0`

NPM metadata confirmed both package versions and export maps. `pi-agent-core` exports `.` and `./node`; `pi-ai` exports `.` plus provider-specific modules including `./openai-responses`, `./openai-completions`, `./anthropic`, `./google`, `./mistral`, and `./bedrock-provider`.

## Confirmed Agent API

Local source: `packages/agent/src/agent.ts`

- `Agent` class exists.
- `subscribe(listener)` returns an unsubscribe function.
- `prompt(input)` starts a run from text or messages.
- `waitForIdle()` resolves after the current run and awaited listeners finish.
- `abort()` aborts the active run.
- `beforeToolCall` and `afterToolCall` hooks are constructor options and mutable instance properties.

## Confirmed Events

Local source: `packages/agent/src/types.ts`

- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`

## Confirmed Tool Shape

Local source: `packages/agent/src/types.ts`

An `AgentTool` extends the base `Tool` and includes `label`, optional `prepareArguments`, async `execute(toolCallId, params, signal, onUpdate)`, and optional `executionMode`. Tool results include `content`, `details`, and optional `terminate`.

## Implementation Decision

WorldDock integrates pi through a TypeScript package adapter. It must not invent an HTTP session endpoint. WorldDock owns product persistence and permissions; pi can only request registered WorldDock tools, with Safety Gate enforcing the progressive disclosure boundary before any tool executes.

## WorldDock Adapter Mapping

Confirmed implementation uses `Agent` from `@earendil-works/pi-agent-core`.

WorldDock maps pi events as follows:

- `agent_start` -> `session.started`
- `message_update` with `text_delta` -> `message.delta`
- `tool_execution_start` -> `tool.requested`
- `tool_execution_end` -> `tool.completed`
- proposal tool result with `suggestion` -> `suggestion.created`
- final assistant usage -> `usage`
- normal `agent_end` -> `session.completed`
- assistant `stopReason=error|aborted` -> `session.failed`

WorldDock tool execution remains outside pi product writes. The adapter calls a WorldDock executor, the runner applies `SafetyGate`, and tool results return to pi as tool result messages.
