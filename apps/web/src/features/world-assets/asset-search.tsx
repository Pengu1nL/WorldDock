import type { WorldAsset } from "@worlddock/domain";

type AssetSearchProps = {
  assets: WorldAsset[];
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (asset: WorldAsset) => void;
};

export function AssetSearch({ assets, query, onQueryChange, onPick }: AssetSearchProps) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? assets.filter((asset) =>
        asset.title.toLowerCase().includes(normalized) ||
        asset.summary.toLowerCase().includes(normalized),
      )
    : assets;

  return (
    <div className="col gap-3">
      <input
        className="input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="搜索资产..."
      />
      <div className="col gap-2">
        {filtered.map((asset) => (
          <button key={asset.id} className="menu-item" type="button" onClick={() => onPick(asset)}>
            <span>{asset.title}</span>
            <span className="mono" style={{ marginLeft: "auto", color: "var(--fg-3)" }}>{asset.kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
