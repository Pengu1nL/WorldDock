# WorldDock Alpha API

WorldDock Alpha exposes a small cloud-first API for personal creators and lightweight ecosystem tools. Local deployment, email delivery, and real payments stay outside Alpha.

## Authentication

Use a user session to create personal access tokens. CLI and scripts then send:

```txt
Authorization: Bearer wdl_...
```

Alpha personal access token scopes:

- `world:read`: list, read, and export owned cloud worlds.
- `world:write`: create, import, edit, and publish owned cloud worlds.
- `repository:read`: pull public repository world packages.
- `billing:read`: read Alpha credit balance, usage, and entitlements.

## Developer Access

```txt
GET  /v1/developer-access/scopes
POST /v1/developer-access/access-tokens
GET  /v1/developer-access/repositories/:owner/:slug/pull
```

Repository pull returns a `worlddock.world-package.v1` payload and does not require a local WorldDock deployment.

## CLI

```bash
WORLD_DOCK_API_URL=https://api.worlddock.example \
WORLD_DOCK_TOKEN=wdl_... \
worlddock worlds list

worlddock worlds export world_123
worlddock worlds import ./memory-market.worlddock.json
worlddock repositories pull ren/memory-market
```

The CLI prints JSON so creators can redirect output to `.worlddock.json` files or pipe it into other tooling.
