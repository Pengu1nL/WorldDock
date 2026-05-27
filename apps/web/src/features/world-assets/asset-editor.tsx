import type { WorldAsset } from "@worlddock/domain";

type AssetEditorProps = {
  asset: WorldAsset;
  onChange: (asset: WorldAsset) => void;
};

export function AssetEditor({ asset, onChange }: AssetEditorProps) {
  return (
    <form className="col gap-3" onSubmit={(event) => event.preventDefault()}>
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>标题</span>
        <input
          className="input"
          value={asset.title}
          onChange={(event) => onChange({ ...asset, title: event.target.value })}
        />
      </label>
      <label className="col gap-2">
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>摘要</span>
        <textarea
          className="input"
          value={asset.summary}
          onChange={(event) => onChange({ ...asset, summary: event.target.value })}
          rows={3}
        />
      </label>
    </form>
  );
}
