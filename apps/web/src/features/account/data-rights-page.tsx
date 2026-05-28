import { useState } from "react";
import { deleteAccount, getAccountDataExport, requestAccountDataExport, type ExportSummary } from "../worlddock/api";
import { Icon } from "../worlddock/components";

type DataRightsPageProps = {
  sessionToken: string;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
};

export function DataRightsPage({ sessionToken, onToast }: DataRightsPageProps) {
  const [accountExport, setAccountExport] = useState<ExportSummary | null>(null);
  const [exportText, setExportText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestExport() {
    setBusy(true);
    try {
      const created = await requestAccountDataExport({ sessionToken });
      const loaded = await getAccountDataExport(created.export.id, { sessionToken });
      setAccountExport(created.export);
      setExportText(JSON.stringify(loaded.data, null, 2));
      onToast({ kind: "save", text: "账户数据导出已生成" });
    } catch {
      onToast({ kind: "warn", text: "账户数据导出失败" });
    } finally {
      setBusy(false);
    }
  }

  async function scheduleDeletion() {
    setBusy(true);
    try {
      await deleteAccount({ sessionToken });
      onToast({ kind: "warn", text: "账户删除已排期" });
    } catch {
      onToast({ kind: "warn", text: "账户删除请求失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="col" style={{ gap: 14 }}>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <button className="btn primary" disabled={!sessionToken || busy} onClick={requestExport}>
          <Icon name="download" size={12} /><span>导出账户数据</span>
        </button>
        {accountExport ? <span className="badge sage">{accountExport.status}</span> : null}
      </div>
      <textarea
        className="input"
        aria-label="账户数据导出 JSON"
        value={exportText}
        readOnly
        rows={8}
        placeholder="账户数据导出 JSON 会显示在这里"
        style={{ width: "min(100%, 760px)", minHeight: 180, fontFamily: "var(--font-mono)", resize: "vertical" }}
      />
      <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 6 }}>
        <div className="row gap-2">
          <Icon name="info" size={13} />
          <span>删除账户前请先完成账户数据导出。</span>
        </div>
        <label className="row gap-2" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>我已完成数据导出并理解删除会排期处理</span>
        </label>
        <button className="btn" style={{ marginTop: 10 }} disabled={!confirmed || !accountExport || busy} onClick={scheduleDeletion}>
          <Icon name="trash" size={12} /><span>删除账户</span>
        </button>
      </div>
    </section>
  );
}
