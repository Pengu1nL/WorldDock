import type { WorldAssetPatch } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type AssetPatchListProps = {
  patches?: WorldAssetPatch[];
  loading?: boolean;
  error?: unknown;
};

export function AssetPatchList({
  patches = [],
  loading = false,
  error,
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
                  {formatCompactDate(patch.createdAt)}
                </span>
              </div>
              <div className="mono" style={{ color: "var(--fg-2)", fontSize: 11, marginTop: 6 }}>
                {getPatchSummary(patch)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function getPatchStatusLabel(status: WorldAssetPatch["status"]) {
  if (status === "applied") return "已应用";
  return "已回滚";
}

function getPatchSummary(patch: WorldAssetPatch) {
  if (typeof patch.diff === "string" && patch.diff.trim()) return "文本补丁";
  if (Array.isArray(patch.diff)) return `${patch.diff.length} 行变更`;
  return patch.afterRevisionId ? `生成修订 ${patch.afterRevisionId}` : patch.id;
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
