import { useState } from "react";
import { ImportExportPanel } from "../worlds/import-export-panel";
import { Icon } from "./components";

type SettingsViewProps = {
  currentWorld?: { id: string; name: string } | null;
  onBack: () => void;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
};

export function SettingsView({
  currentWorld,
  onBack,
  onToast,
}: SettingsViewProps) {
  const [tab, setTab] = useState("model");
  const [modelStatus, setModelStatus] = useState("未验证");

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ settings</div>
          <h1>设置</h1>
          <div className="sub">本地模型与世界包工具</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回</button>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["model", "模型"],
          ["data", "导入导出"],
        ].map(([id, label]) => (
          <button key={id} className={"sb-btn " + (tab === id ? "primary" : "")} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 32px 40px", maxWidth: 860 }}>
        {tab === "model" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>模型配置</h2>
            <Field label="AI_PROVIDER" value="openai" />
            <Field label="OPENAI_BASE_URL" value="https://api.openai.com/v1" />
            <Field label="OPENAI_API_KEY" value="服务端环境变量" />
            <Field label="AI_MODEL" value="服务端环境变量" />
            <button
              className="btn primary"
              onClick={() => {
                setModelStatus("请在工作台发起一次真实 Agent Run 验证模型连接");
                onToast({ kind: "info", text: "请在工作台发起真实 Agent Run" });
              }}
            >
              <Icon name="bolt" size={12} /><span>验证方式</span>
            </button>
            <div style={{ marginTop: 12, fontSize: 13 }}>{modelStatus}</div>
          </section>
        )}
        {tab === "data" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>导入导出</h2>
            <ImportExportPanel world={currentWorld} onToast={onToast} />
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="label">{label}</span>
      <input className="input" aria-label={label} value={value} readOnly style={{ width: "min(100%, 360px)" }} />
    </label>
  );
}
