import type { WorldAssetPatch } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type AssetPatchListProps = {
  patches?: WorldAssetPatch[];
  loading?: boolean;
  error?: unknown;
  onRevert?: (patchId: string) => void;
  revertingPatchId?: string | null;
  disabled?: boolean;
};

export function AssetPatchList({
  patches = [],
  loading = false,
  error,
  onRevert,
  revertingPatchId = null,
  disabled = false,
}: AssetPatchListProps) {
  return (
    <section className="card" style={{ padding: 14 }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="history" size={13} style={{ color: "var(--fg-2)" }} />
        <span style={{ color: "var(--fg)", fontSize: "var(--t-13)", fontWeight: 650 }}>
          Patch history
        </span>
        <div className="flex" />
        <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
          {patches.length}
        </span>
      </div>

      {error ? (
        <div className="prose" style={{ color: "var(--brick)", fontSize: "var(--t-12)", lineHeight: 1.55 }}>
          {getErrorMessage(error)}
        </div>
      ) : loading ? (
        <div className="row gap-2" style={{ color: "var(--fg-3)", fontSize: "var(--t-12)" }}>
          <span className="dot amber pulse" />
          <span className="mono">正在载入补丁记录</span>
        </div>
      ) : patches.length === 0 ? (
        <div className="prose" style={{ color: "var(--fg-3)", fontSize: "var(--t-12)", lineHeight: 1.55 }}>
          暂无补丁历史。后续编辑会话产生的变更会出现在这里。
        </div>
      ) : (
        <div className="col gap-2">
          {patches.map((patch) => (
            <div
              key={patch.id}
              style={{
                borderTop: "1px solid var(--hairline)",
                paddingTop: 10,
              }}
            >
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <span className={"tag plain " + (patch.status === "applied" ? "sage" : "")}>
                  {getPatchStatusLabel(patch.status)}
                </span>
                <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
                  {getPatchVersionLabel(patch)}
                </span>
                <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
                  {formatCompactDate(patch.createdAt)}
                </span>
                <div className="flex" />
                {patch.status === "applied" && onRevert ? (
                  <button
                    className="btn sm"
                    disabled={disabled || revertingPatchId === patch.id}
                    onClick={() => onRevert(patch.id)}
                    type="button"
                  >
                    {revertingPatchId === patch.id ? "撤销中" : "撤销"}
                  </button>
                ) : patch.status === "reverted" ? (
                  <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
                    已撤销
                  </span>
                ) : null}
              </div>
              <PatchDiff patch={patch} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function getPatchStatusLabel(status: WorldAssetPatch["status"]) {
  if (status === "applied") return "已应用";
  return "已撤销";
}

function PatchDiff({ patch }: { patch: WorldAssetPatch }) {
  if (Array.isArray(patch.diff) && patch.diff.length > 0) {
    return (
      <div
        className="mono"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: 6,
          marginTop: 8,
          overflow: "hidden",
          fontSize: 11,
        }}
      >
        {patch.diff.slice(0, 12).map((line, index) => (
          <div
            key={`${line.type}-${index}-${line.text}`}
            style={{
              display: "grid",
              gridTemplateColumns: "18px minmax(0, 1fr) auto",
              gap: 8,
              padding: "4px 7px",
              color: getDiffLineColor(line.type),
              background: getDiffLineBackground(line.type),
              borderTop: index === 0 ? "0" : "1px solid var(--hairline)",
            }}
          >
            <span style={{ fontWeight: 700 }}>{getDiffPrefix(line.type)}</span>
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line.text || " "}</span>
            <span style={{ color: "var(--fg-3)" }}>{getDiffLineNumber(line)}</span>
          </div>
        ))}
        {patch.diff.length > 12 ? (
          <div style={{ padding: "5px 7px", color: "var(--fg-3)", borderTop: "1px solid var(--hairline)" }}>
            另有 {patch.diff.length - 12} 行变更
          </div>
        ) : null}
      </div>
    );
  }

  if (typeof patch.diff === "string" && patch.diff.trim()) {
    return (
      <pre
        className="mono"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: 6,
          color: "var(--fg-2)",
          fontSize: 11,
          margin: "8px 0 0",
          maxHeight: 160,
          overflow: "auto",
          padding: 8,
          whiteSpace: "pre-wrap",
        }}
      >
        {patch.diff.trim()}
      </pre>
    );
  }

  return (
    <div className="mono" style={{ color: "var(--fg-2)", fontSize: 11, marginTop: 6 }}>
      {getPatchSummary(patch)}
    </div>
  );
}

function getPatchSummary(patch: WorldAssetPatch) {
  if (typeof patch.diff === "string" && patch.diff.trim()) return "文本补丁";
  if (Array.isArray(patch.diff)) return `${patch.diff.length} 行变更`;
  return patch.afterRevisionId ? `生成修订 ${patch.afterRevisionId}` : patch.id;
}

function getPatchVersionLabel(patch: WorldAssetPatch) {
  const versionedPatch = patch as WorldAssetPatch & {
    assetVersionFrom?: number | null;
    assetVersionTo?: number | null;
  };
  if (typeof versionedPatch.assetVersionFrom === "number" && typeof versionedPatch.assetVersionTo === "number") {
    return `v${versionedPatch.assetVersionFrom} -> v${versionedPatch.assetVersionTo}`;
  }
  return patch.afterRevisionId ? "修订已生成" : patch.id;
}

function getDiffPrefix(type: string) {
  if (type === "add") return "+";
  if (type === "remove") return "-";
  return " ";
}

function getDiffLineColor(type: string) {
  if (type === "add") return "var(--sage)";
  if (type === "remove") return "var(--brick)";
  return "var(--fg-3)";
}

function getDiffLineBackground(type: string) {
  if (type === "add") return "color-mix(in srgb, var(--sage) 9%, transparent)";
  if (type === "remove") return "color-mix(in srgb, var(--brick) 8%, transparent)";
  return "transparent";
}

function getDiffLineNumber(line: NonNullable<Exclude<WorldAssetPatch["diff"], string | null | undefined>>[number]) {
  if (line.type === "add") return `+${line.lineTo}`;
  if (line.type === "remove") return `-${line.lineFrom}`;
  return `${line.lineFrom}->${line.lineTo}`;
}

function formatCompactDate(value?: string | null) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "补丁记录暂不可用。";
}
