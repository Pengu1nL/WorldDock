# World Asset Progressive Disclosure Protocol

WorldDock long-world context follows progressive disclosure: give the Agent a compact entry point first, then let it open only relevant layers.

Disclosure layers:

- Manifest: world name, type, summary, tags, asset counts, recent changes, and a compact index.
- Card: asset preview with id, kind, title, short excerpt, tags, relations, and updatedAt.
- Brief: compact canonical summary with stable facts, relationships, open questions, and source pointers.
- Detail: full canonical asset body, loaded only after a specific reason.
- Source Fragment: original text fragments for citation, reconciliation, or conflict review.
- Release Delta: version change summary for release notes or fork comparison.

Initial session context:

- Always include exactly one Manifest.
- Include up to 8 ranked Cards.
- Include up to 3 ranked Briefs when the prompt strongly matches those assets.
- Do not include Detail or Source Fragment in initial context.

Tool disclosure rules:

- `get_world_manifest` returns only Manifest.
- `search_world_assets` returns Cards, never full bodies.
- `get_asset_brief` returns Brief.
- `get_asset_detail` returns Detail and must be preceded by Card or Brief use in the same run.
- `get_asset_source_fragments` returns Source Fragments and is reserved for citation, contradiction checks, or precise rewrite tasks.

Persistence rules:

- Every disclosed context item emits `context.used` with `level`, `kind`, `title`, `excerpt`, `targetId`, and `source`.
- Frontend Context Inspector groups context by disclosure level.
- Product data remains canonical in WorldDock tables; summaries are retrieval aids, not source of truth.

Alpha token budget:

- Manifest: <= 1200 tokens.
- Initial Cards: <= 8 cards, <= 80 tokens each.
- Initial Briefs: <= 3 briefs, <= 600 tokens each.
- Detail: loaded on demand, target <= 2000 tokens.
- Source Fragment: loaded on demand, target <= 1200 tokens.
