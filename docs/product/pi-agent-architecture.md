# Pi Agent Architecture

WorldDock API owns users, worlds, assets, releases, billing, moderation, permissions, and persistence.

pi owns Agent session execution: model calls, streaming events, tool-call loop, skill invocation, context compaction, and session state.

WorldDock never lets pi write directly to product tables. pi can only request registered WorldDock tools. Every tool request passes Safety Gate, returns typed data, and is persisted through WorldDock services.

Allowed read tools:

- `get_world_manifest`
- `search_world_assets`
- `get_asset_brief`
- `get_asset_detail`
- `get_asset_source_fragments`
- `list_repository_releases`

Allowed proposal tools:

- `propose_setting`
- `propose_story_seed`
- `propose_conflict`
- `propose_release_notes`

Dangerous operations stay outside pi and require explicit user confirmation through WorldDock API:

- save suggestion to world asset
- delete or overwrite existing asset
- publish release
- push local snapshot
- charge credits
- change visibility or permissions
- read local files or secrets
- execute shell commands

Only pi/model execution consumes creation credits. Manual editing, browsing, Star, Fork, import/export, Push, and release viewing do not consume credits unless the user explicitly asks pi to generate or review content.
