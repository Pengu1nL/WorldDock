import { useState } from "react";
import type { ForkSyncPreview, ForkSyncResult } from "@worlddock/domain";
import { detachFork, getForkUpstreamDiff, syncFork } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type ForkSyncPanelProps = {
  forkId: string;
  sessionToken: string;
  onDetached: (forkId: string) => void;
};

export function ForkSyncPanel({ forkId, sessionToken, onDetached }: ForkSyncPanelProps) {
  const [preview, setPreview] = useState<ForkSyncPreview | null>(null);
  const [syncResult, setSyncResult] = useState<ForkSyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare() {
    setBusy(true);
    setError("");
    setPreview(null);
    setSyncResult(null);
    try {
      const result = await getForkUpstreamDiff(forkId, { sessionToken });
      setPreview(result.diff);
    } catch {
      setError("仅 Fork 创建者可同步，或当前 API 暂不可用。");
    } finally {
      setBusy(false);
    }
  }

  async function applySync() {
    setBusy(true);
    setError("");
    try {
      const result = await syncFork(forkId, { sessionToken });
      setSyncResult(result.sync);
      setPreview({
        ...result.sync,
        hasUpstreamChanges: result.sync.skipped.length > 0,
        changes: result.sync.skipped,
      });
    } catch {
      setError("同步失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function detach() {
    setBusy(true);
    setError("");
    try {
      await detachFork(forkId, { sessionToken });
      onDetached(forkId);
    } catch {
      setError("Detach 失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const changes = preview?.changes ?? [];

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <button className="btn" disabled={busy} onClick={compare}>
          <Icon name="explore" size={12} />
          <span>比较上游</span>
        </button>
        <button className="btn primary" disabled={busy || Boolean(error) || !preview?.hasUpstreamChanges} onClick={applySync}>
          <Icon name="download" size={12} />
          <span>同步非冲突变更</span>
        </button>
        <button className="btn ghost" disabled={busy} onClick={detach}>
          <Icon name="x" size={12} />
          <span>Detach</span>
        </button>
      </div>
      {error ? <div className="badge amber" style={{ justifyContent: "flex-start", minHeight: 24 }}>{error}</div> : null}
      {preview && !preview.hasUpstreamChanges ? <p className="prose">当前 Fork 已经跟上游发布版本一致。</p> : null}
      {changes.length > 0 ? (
        <div className="col" style={{ gap: 8 }}>
          {changes.map((change) => (
            <div key={`${change.kind}:${change.assetId}`} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>{change.title}</span>
              <span className={`badge ${change.kind === "removed" ? "amber" : "slate"}`}>{change.kind}</span>
            </div>
          ))}
        </div>
      ) : null}
      {syncResult ? (
        <p className="prose" style={{ marginBottom: 0 }}>
          已应用 {syncResult.applied.length} 项，跳过 {syncResult.skipped.length} 项。
        </p>
      ) : null}
    </div>
  );
}
