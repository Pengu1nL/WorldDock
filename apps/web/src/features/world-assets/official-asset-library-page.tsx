"use client";

import { useEffect, useMemo, useState } from "react";
import type { OfficialWorldAsset } from "../worlddock/api";
import { Icon } from "../worlddock/components";
import {
  OFFICIAL_ASSET_FILTERS,
  OfficialAssetCard,
  getOfficialAssetTypeLabel,
  type OfficialAssetFilter,
  type OfficialAssetType,
} from "./official-asset-card";
import { useOfficialAssets } from "./use-official-assets";

type WorldLike = {
  id: string;
  name?: string;
};

type OfficialAssetLibraryPageProps = {
  world: WorldLike;
  assets?: OfficialWorldAsset[];
  loading?: boolean;
  onOpenAsset?: (assetId: string) => void;
  onCreateAsset?: (type: OfficialAssetType) => void;
  onLoadError?: (error: unknown) => void;
};

export function OfficialAssetLibraryPage({
  world,
  assets,
  loading = false,
  onOpenAsset,
  onCreateAsset,
  onLoadError,
}: OfficialAssetLibraryPageProps) {
  const [selectedType, setSelectedType] = useState<OfficialAssetFilter>("all");
  const [search, setSearch] = useState("");

  if (assets !== undefined) {
    return (
      <OfficialAssetLibraryContent
        world={world}
        assets={filterOfficialAssets(assets, selectedType, search)}
        countSourceAssets={assets}
        loading={loading}
        selectedType={selectedType}
        search={search}
        onTypeChange={setSelectedType}
        onSearchChange={setSearch}
        onOpenAsset={onOpenAsset}
        onCreateAsset={onCreateAsset}
      />
    );
  }

  return (
    <OfficialAssetLibraryRemotePage
      world={world}
      selectedType={selectedType}
      search={search}
      onTypeChange={setSelectedType}
      onSearchChange={setSearch}
      onOpenAsset={onOpenAsset}
      onCreateAsset={onCreateAsset}
      onLoadError={onLoadError}
    />
  );
}

type OfficialAssetLibraryRemotePageProps = {
  world: WorldLike;
  selectedType: OfficialAssetFilter;
  search: string;
  onTypeChange: (type: OfficialAssetFilter) => void;
  onSearchChange: (search: string) => void;
  onOpenAsset?: (assetId: string) => void;
  onCreateAsset?: (type: OfficialAssetType) => void;
  onLoadError?: (error: unknown) => void;
};

function OfficialAssetLibraryRemotePage({
  world,
  selectedType,
  search,
  onTypeChange,
  onSearchChange,
  onOpenAsset,
  onCreateAsset,
  onLoadError,
}: OfficialAssetLibraryRemotePageProps) {
  const query = useMemo(() => ({
    type: selectedType === "all" ? undefined : selectedType,
    q: search,
  }), [search, selectedType]);
  const officialAssets = useOfficialAssets(world.id, query);

  useEffect(() => {
    if (officialAssets.error) onLoadError?.(officialAssets.error);
  }, [officialAssets.error, onLoadError]);

  const assets = officialAssets.data?.assets ?? [];

  return (
    <OfficialAssetLibraryContent
      world={world}
      assets={filterOfficialAssets(assets, selectedType, search)}
      countSourceAssets={assets}
      loading={officialAssets.isLoading}
      error={officialAssets.error}
      selectedType={selectedType}
      search={search}
      onTypeChange={onTypeChange}
      onSearchChange={onSearchChange}
      onOpenAsset={onOpenAsset}
      onCreateAsset={onCreateAsset}
    />
  );
}

type OfficialAssetLibraryContentProps = {
  world: WorldLike;
  assets: OfficialWorldAsset[];
  countSourceAssets: OfficialWorldAsset[];
  loading?: boolean;
  error?: unknown;
  selectedType: OfficialAssetFilter;
  search: string;
  onTypeChange: (type: OfficialAssetFilter) => void;
  onSearchChange: (search: string) => void;
  onOpenAsset?: (assetId: string) => void;
  onCreateAsset?: (type: OfficialAssetType) => void;
};

function OfficialAssetLibraryContent({
  world,
  assets,
  countSourceAssets,
  loading = false,
  error,
  selectedType,
  search,
  onTypeChange,
  onSearchChange,
  onOpenAsset,
  onCreateAsset,
}: OfficialAssetLibraryContentProps) {
  const counts = useMemo(() => countOfficialAssetsByType(countSourceAssets), [countSourceAssets]);
  const createType = selectedType === "all" ? "rule" : selectedType;

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name ?? "world"} / <span style={{ color: "var(--fg-1)" }}>assets</span>
          </div>
          <h1>资产库</h1>
          <div className="sub">
            {loading ? "正在载入官方资产" : `${assets.length} 项官方资产`}
          </div>
        </div>
        {onCreateAsset ? (
          <div className="row gap-2">
            <button
              className="btn"
              onClick={() => onCreateAsset(createType)}
              type="button"
            >
              <Icon name="plus" size={12} />
              <span>新建{getOfficialAssetTypeLabel(createType)}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div
        style={{
          padding: "12px 32px",
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {OFFICIAL_ASSET_FILTERS.map((filter) => (
          <button
            aria-pressed={selectedType === filter.id}
            className={"sb-btn " + (selectedType === filter.id ? "primary" : "")}
            key={filter.id}
            onClick={() => onTypeChange(filter.id)}
            style={{ height: 26, fontSize: 12 }}
            type="button"
          >
            <Icon name={filter.icon} size={11} />
            <span>{filter.label}</span>
            <span className="mono sb-dim">{counts[filter.id] ?? 0}</span>
          </button>
        ))}
        <div className="flex" />
        <input
          aria-label="搜索官方资产"
          className="input"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索资产..."
          style={{ width: "min(100%, 320px)", height: 26, fontSize: 12 }}
          value={search}
        />
      </div>

      <div style={{ padding: "20px 32px 40px", flex: 1 }}>
        {error ? (
          <OfficialAssetLibraryError error={error} />
        ) : loading ? (
          <OfficialAssetLibraryLoading />
        ) : assets.length === 0 ? (
          <OfficialAssetLibraryEmpty selectedType={selectedType} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {assets.map((asset) => (
              <OfficialAssetCard
                asset={asset}
                key={asset.id}
                onOpenAsset={onOpenAsset}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OfficialAssetLibraryLoading() {
  return (
    <div className="row gap-2" style={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
      <span className="dot amber pulse" />
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 12 }}>
        正在载入官方资产
      </span>
    </div>
  );
}

function OfficialAssetLibraryError({ error }: { error: unknown }) {
  return (
    <div className="card" style={{ padding: 16, maxWidth: 520 }}>
      <div className="row gap-2" style={{ color: "var(--brick)", marginBottom: 6 }}>
        <Icon name="info" size={13} />
        <span style={{ fontSize: "var(--t-13)", fontWeight: 600 }}>资产库暂不可用</span>
      </div>
      <div className="prose" style={{ fontSize: "var(--t-12)", color: "var(--fg-2)", lineHeight: 1.55 }}>
        {getErrorMessage(error)}
      </div>
    </div>
  );
}

function OfficialAssetLibraryEmpty({ selectedType }: { selectedType: OfficialAssetFilter }) {
  const label = selectedType === "all" ? "资产" : getOfficialAssetTypeLabel(selectedType);

  return (
    <div
      className="card"
      style={{
        padding: 18,
        minHeight: 160,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fg-3)",
      }}
    >
      <span className="mono" style={{ fontSize: 12 }}>
        暂无{label}
      </span>
    </div>
  );
}

function filterOfficialAssets(
  assets: OfficialWorldAsset[],
  selectedType: OfficialAssetFilter,
  search: string,
) {
  const q = search.trim().toLowerCase();

  return assets.filter((asset) => {
    if (selectedType !== "all" && asset.type !== selectedType) return false;
    if (!q) return true;

    return [
      asset.name,
      asset.summary,
      getOfficialAssetTypeLabel(asset.type),
      ...(Array.isArray(asset.tags) ? asset.tags : []),
    ].some((value) => String(value ?? "").toLowerCase().includes(q));
  });
}

function countOfficialAssetsByType(assets: OfficialWorldAsset[]) {
  const counts: Record<OfficialAssetFilter, number> = {
    all: assets.length,
    character: 0,
    organization: 0,
    location: 0,
    event: 0,
    rule: 0,
  };

  for (const asset of assets) {
    counts[asset.type] += 1;
  }

  return counts;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "请稍后重试。";
}
