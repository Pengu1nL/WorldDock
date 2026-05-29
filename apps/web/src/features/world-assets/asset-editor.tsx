import type { WorldAsset } from "@worlddock/domain";

type AssetEditorProps = {
  asset: Partial<WorldAsset> & { kind: WorldAsset["kind"] };
  saving?: boolean;
  onChange: (asset: Partial<WorldAsset> & { kind: WorldAsset["kind"] }) => void;
  onSubmit: () => void;
  onDelete?: () => void;
};

export function AssetEditor({ asset, saving, onChange, onSubmit, onDelete }: AssetEditorProps) {
  const isExistingAsset = Boolean(asset.id);

  return (
    <form
      className="col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>类型</span>
        <select
          className="input"
          value={asset.kind}
          disabled={isExistingAsset || saving}
          title={isExistingAsset ? "已有资产不能修改类型" : undefined}
          onChange={(event) => onChange({ ...asset, kind: event.target.value as WorldAsset["kind"] })}
        >
          <option value="setting">设定</option>
          <option value="seed">种子</option>
          <option value="conflict">冲突</option>
        </select>
      </label>
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>分类</span>
        <input
          className="input"
          value={asset.category ?? ""}
          onChange={(event) => onChange({ ...asset, category: event.target.value })}
          placeholder="例如：世界规则"
        />
      </label>
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>标题</span>
        <input
          className="input"
          value={asset.title ?? ""}
          onChange={(event) => onChange({ ...asset, title: event.target.value })}
        />
      </label>
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>摘要</span>
        <textarea
          className="input"
          value={asset.summary ?? ""}
          onChange={(event) => onChange({ ...asset, summary: event.target.value })}
          rows={3}
        />
      </label>
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>正文</span>
        <textarea
          className="input"
          value={asset.body ?? ""}
          onChange={(event) => onChange({ ...asset, body: event.target.value })}
          rows={8}
        />
      </label>
      <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
        {onDelete && (
          <button className="btn ghost danger" type="button" onClick={onDelete} disabled={saving}>
            删除
          </button>
        )}
        <button
          className="btn primary"
          type="submit"
          disabled={saving || !asset.title?.trim() || !asset.summary?.trim()}
        >
          {saving ? "保存中..." : "保存资产"}
        </button>
      </div>
    </form>
  );
}
