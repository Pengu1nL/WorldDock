import { useEffect, useMemo, useState } from "react";
import type { WorldAsset } from "@worlddock/domain";
import { pushWorldRelease, type PushWorldReleaseResponse } from "./api";
import { Icon } from "./components";

type PublishViewProps = {
  currentWorld: { id: string; name: string };
  assets: WorldAsset[];
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
  onBack: () => void;
  pushApi?: typeof pushWorldRelease;
};

export type SecretScanFinding = {
  path: string;
  reason: "api_key" | "env_file" | "private_key" | "token";
  excerpt: string;
};

type ScanPattern = {
  reason: SecretScanFinding["reason"];
  regex: RegExp;
  excerpt: string;
};

const SECRET_PATTERNS: ScanPattern[] = [
  { reason: "api_key", regex: /OPENAI_API_KEY\s*=/i, excerpt: "OPENAI_API_KEY=<redacted>" },
  { reason: "api_key", regex: /PI_PROVIDER_API_KEY\s*=/i, excerpt: "PI_PROVIDER_API_KEY=<redacted>" },
  { reason: "private_key", regex: /-----BEGIN PRIVATE KEY-----/i, excerpt: "-----BEGIN PRIVATE KEY-----<redacted>" },
  { reason: "env_file", regex: /(^|[\s:/\\-])\.env($|[.\s:/\\-])/i, excerpt: ".env" },
  { reason: "token", regex: /Bearer\s+sk-[A-Za-z0-9_-]+/i, excerpt: "Bearer <redacted>" },
  { reason: "token", regex: /sk-proj-[A-Za-z0-9_-]+/i, excerpt: "sk-proj-<redacted>" },
];

const REASON_LABELS: Record<SecretScanFinding["reason"], string> = {
  api_key: "API Key",
  env_file: "Env",
  private_key: "Private Key",
  token: "Token",
};

export function PublishView({
  currentWorld,
  assets,
  onToast,
  onBack,
  pushApi = pushWorldRelease,
}: PublishViewProps) {
  const assetKey = useMemo(() => assets.map((asset) => asset.id).join("\n"), [assets]);
  const [owner, setOwner] = useState("");
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [allowSecretFindings, setAllowSecretFindings] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [release, setRelease] = useState<PushWorldReleaseResponse["release"] | null>(null);

  useEffect(() => {
    setSelectedAssetIds(assets.map((asset) => asset.id));
    setAllowSecretFindings(false);
    setRelease(null);
  }, [assetKey, assets]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [assets, selectedAssetIds],
  );
  const findings = useMemo(() => scanAssetsForSecrets(selectedAssets), [selectedAssets]);
  const hasAssets = assets.length > 0;
  const hasSelection = selectedAssetIds.length > 0;
  const needsConfirmation = findings.length > 0;
  const canPublish = Boolean(
    currentWorld.id &&
    owner.trim() &&
    slug.trim() &&
    hasSelection &&
    (!needsConfirmation || allowSecretFindings) &&
    !publishing,
  );

  const toggleAsset = (assetId: string) => {
    setRelease(null);
    setAllowSecretFindings(false);
    setSelectedAssetIds((current) => (
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId]
    ));
  };

  const publish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setRelease(null);
    try {
      const result = await pushApi(currentWorld.id, {
        owner: owner.trim(),
        slug: slug.trim(),
        note: note.trim() || undefined,
        selectedAssetIds,
        allowSecretFindings: needsConfirmation ? true : undefined,
      });
      setRelease(result.release);
      onToast({ kind: "save", text: "Release 已发布" });
    } catch {
      onToast({ kind: "warn", text: "发布失败 · 请检查界仓连接和仓库权限" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ publish</div>
          <h1>发布</h1>
          <div className="sub">{currentWorld.name}</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回</button>
      </div>

      <div style={{ padding: "20px 32px 40px", maxWidth: 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" }}>
          <section className="card" style={{ padding: 18 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <h2 className="title-font" style={{ marginTop: 0 }}>仓库</h2>
              <span className="badge slate">{owner && slug ? `${owner}/${slug}` : "未填写"}</span>
            </div>
            <div className="col gap-3">
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
                <label>
                  <span className="label">Owner</span>
                  <input
                    className="input"
                    aria-label="Owner"
                    value={owner}
                    onChange={(event) => {
                      setOwner(event.target.value);
                      setRelease(null);
                    }}
                    placeholder="ren"
                  />
                </label>
                <label>
                  <span className="label">Slug</span>
                  <input
                    className="input"
                    aria-label="Slug"
                    value={slug}
                    onChange={(event) => {
                      setSlug(event.target.value);
                      setRelease(null);
                    }}
                    placeholder="tide-book"
                  />
                </label>
              </div>
              <label>
                <span className="label">Release note <span className="opt">可选</span></span>
                <textarea
                  className="textarea"
                  aria-label="Release note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setRelease(null);
                  }}
                  rows={3}
                />
              </label>
            </div>
          </section>

          <section className="card" style={{ padding: 18 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <h2 className="title-font" style={{ marginTop: 0 }}>预检</h2>
              {findings.length > 0 ? (
                <span className="badge brick">命中 {findings.length}</span>
              ) : (
                <span className="badge sage">未发现</span>
              )}
            </div>
            {!hasSelection ? (
              <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-2)" }}>未选择资产</p>
            ) : findings.length === 0 ? (
              <p className="prose" style={{ fontSize: "var(--t-13)", color: "var(--fg-2)" }}>所选资产未命中本地敏感模式。</p>
            ) : (
              <div className="col gap-2">
                {findings.map((finding, index) => (
                  <div key={`${finding.path}:${finding.reason}:${index}`} style={{ border: "1px solid var(--brick-dim)", background: "var(--brick-bg)", borderRadius: "var(--r-4)", padding: 10 }}>
                    <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--brick)" }}>{REASON_LABELS[finding.reason]}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)", textAlign: "right" }}>{finding.path}</span>
                    </div>
                    <div className="mono" style={{ marginTop: 6, fontSize: 11, color: "var(--fg-1)", wordBreak: "break-word" }}>
                      {finding.excerpt}
                    </div>
                  </div>
                ))}
                <label className="row gap-2" style={{ marginTop: 4, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    aria-label="确认允许发布疑似敏感内容"
                    checked={allowSecretFindings}
                    onChange={(event) => setAllowSecretFindings(event.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: "var(--t-13)", color: "var(--fg-1)" }}>确认允许发布疑似敏感内容</span>
                </label>
              </div>
            )}
          </section>
        </div>

        <section className="card" style={{ padding: 18, marginTop: 14 }}>
          <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>资产</h2>
            <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="badge slate">{selectedAssetIds.length}/{assets.length}</span>
              <button className="btn sm" onClick={() => { setSelectedAssetIds(assets.map((asset) => asset.id)); setAllowSecretFindings(false); }} disabled={!hasAssets}>
                全选
              </button>
              <button className="btn sm ghost" onClick={() => { setSelectedAssetIds([]); setAllowSecretFindings(false); }} disabled={!hasAssets}>
                清空
              </button>
            </div>
          </div>

          {!hasAssets ? (
            <div style={{ padding: 12, background: "var(--surface-2)", border: "1px solid var(--hairline)", borderRadius: "var(--r-4)" }}>
              <span style={{ color: "var(--fg-2)", fontSize: "var(--t-13)" }}>当前世界还没有可发布资产</span>
            </div>
          ) : (
            <div className="col gap-2">
              {assets.map((asset) => (
                <label key={asset.id} className="row gap-2" style={{ border: "1px solid var(--hairline)", borderRadius: "var(--r-4)", padding: "9px 10px", alignItems: "flex-start", background: selectedAssetIds.includes(asset.id) ? "var(--surface-2)" : "transparent" }}>
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={() => toggleAsset(asset.id)}
                    aria-label={`选择资产 ${asset.title}`}
                    style={{ marginTop: 4 }}
                  />
                  <span className="col" style={{ gap: 3, minWidth: 0 }}>
                    <span className="row gap-2" style={{ minWidth: 0, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{asset.title}</span>
                      <span className="badge slate">{asset.kind}</span>
                    </span>
                    <span className="prose" style={{ color: "var(--fg-2)", fontSize: "var(--t-12)" }}>{asset.summary}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          {release ? (
            <a
              href={release.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--sage)", fontSize: "var(--t-13)", wordBreak: "break-all" }}
            >
              {release.url}
            </a>
          ) : (
            <span className="badge slate">等待发布</span>
          )}
          <button className="btn primary" onClick={publish} disabled={!canPublish}>
            <Icon name="push" size={13} /><span>{publishing ? "发布中" : "发布"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function scanAssetsForSecrets(assets: WorldAsset[]): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];
  for (const [index, asset] of assets.entries()) {
    const basePath = `assets[${index}]`;
    const chunks = [
      { path: `${basePath}.title`, value: asset.title },
      { path: `${basePath}.summary`, value: asset.summary },
      { path: `${basePath}.body`, value: asset.body },
      ...collectPayloadText(asset.payload, `${basePath}.payload`),
    ];

    for (const chunk of chunks) {
      if (!chunk.value) continue;
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(chunk.value)) {
          findings.push({
            path: chunk.path,
            reason: pattern.reason,
            excerpt: pattern.excerpt,
          });
        }
      }
    }
  }
  return findings;
}

function collectPayloadText(value: unknown, path: string): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (typeof value === "number" || typeof value === "boolean") return [{ path, value: String(value) }];
  if (!value || typeof value !== "object" || isBinaryLike(value)) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPayloadText(item, `${path}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, item], index) => [
    { path: `${path}.keys[${index}]`, value: key },
    ...collectPayloadText(item, `${path}.values[${index}]`),
  ]);
}

function isBinaryLike(value: object) {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}
