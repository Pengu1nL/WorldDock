import { useState } from "react";
import type { WorldPackage } from "@worlddock/domain";
import { exportWorldPackage, getWorldExport, importWorldPackage } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type ImportExportPanelProps = {
  world?: { id: string; name: string } | null;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
};

export function ImportExportPanel({ world, onToast }: ImportExportPanelProps) {
  const [exportId, setExportId] = useState("");
  const [packageText, setPackageText] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportCurrentWorld() {
    if (!world) return;
    setBusy(true);
    try {
      const created = await exportWorldPackage(world.id);
      const loaded = await getWorldExport(created.export.id);
      setExportId(created.export.id);
      setPackageText(JSON.stringify(loaded.package, null, 2));
      onToast({ kind: "save", text: "世界包已生成" });
    } catch {
      onToast({ kind: "warn", text: "世界包导出失败" });
    } finally {
      setBusy(false);
    }
  }

  async function importPackage() {
    setBusy(true);
    try {
      const parsed = JSON.parse(packageText) as WorldPackage;
      await importWorldPackage(parsed);
      onToast({ kind: "save", text: "世界包已导入" });
    } catch {
      onToast({ kind: "warn", text: "世界包导入失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="col" style={{ gap: 14 }}>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <button className="btn primary" disabled={!world || busy} onClick={exportCurrentWorld}>
          <Icon name="download" size={12} /><span>导出世界包</span>
        </button>
        <button className="btn" disabled={!packageText.trim() || busy} onClick={importPackage}>
          <Icon name="upload" size={12} /><span>导入世界包</span>
        </button>
        {exportId ? <span className="badge slate">{exportId}</span> : null}
      </div>
      <textarea
        className="input"
        aria-label="世界包 JSON"
        value={packageText}
        onChange={(event) => setPackageText(event.target.value)}
        rows={12}
        placeholder={world ? "导出的世界包 JSON 会显示在这里" : "打开一个世界后可导出世界包，也可直接粘贴 JSON 导入"}
        style={{ width: "min(100%, 760px)", minHeight: 260, fontFamily: "var(--font-mono)", resize: "vertical" }}
      />
    </section>
  );
}
