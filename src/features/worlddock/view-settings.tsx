import { useState } from "react";
import type { WorldMode } from "./domain";
import { Icon } from "./components";

type SettingsViewProps = {
  mode: WorldMode;
  balance: number;
  communityConnected: boolean;
  onBack: () => void;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
  onCommunityConnected: (connected: boolean) => void;
};

export function SettingsView({
  mode,
  balance,
  communityConnected,
  onBack,
  onToast,
  onCommunityConnected,
}: SettingsViewProps) {
  const [tab, setTab] = useState("billing");
  const [modelStatus, setModelStatus] = useState("未测试");
  const [token, setToken] = useState(communityConnected ? "wd_mock_token" : "");
  const [tokenStatus, setTokenStatus] = useState(communityConnected ? "Token 已保存 · Push 权限正常" : "未连接");

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">/ settings</div>
          <h1>设置</h1>
          <div className="sub">{mode === "local" ? "Local 模型与社区连接" : "Cloud 用量与账户"}</div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回</button>
      </div>

      <div style={{ padding: "12px 32px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["billing", "用量"],
          ["model", "模型"],
          ["community", "社区连接"],
          ["data", "导入导出"],
        ].map(([id, label]) => (
          <button key={id} className={"sb-btn " + (tab === id ? "primary" : "")} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 32px 40px", maxWidth: 860 }}>
        {tab === "billing" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>用量与余额</h2>
            <Metric label="当前余额" value={`¥${balance.toFixed(2)}`} />
            <Metric label="本月消耗" value="¥37.60" />
            <Metric label="最近一次 Agent Run" value="1,283 tokens / ¥1.83" />
            <div className="badge amber">余额低于 ¥5.00 时会拦截新的 Agent Run</div>
          </section>
        )}
        {tab === "model" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>模型配置</h2>
            <Field label="MODEL_PROVIDER" value="openai-compatible" />
            <Field label="MODEL_BASE_URL" value="http://localhost:8000/v1" />
            <Field label="MODEL_API_KEY" value="********" />
            <Field label="MODEL_NAME" value="qwen3-32b" />
            <Field label="MAX_TOKENS" value="4096" />
            <Field label="TEMPERATURE" value="0.7" />
            <Field label="CONTEXT_LIMIT" value="32768" />
            <button
              className="btn primary"
              onClick={() => {
                setModelStatus("模型连接正常 · 218ms");
                onToast({ kind: "save", text: "模型连接正常" });
              }}
            >
              <Icon name="bolt" size={12} /><span>测试连接</span>
            </button>
            <div style={{ marginTop: 12, fontSize: 13 }}>{modelStatus}</div>
          </section>
        )}
        {tab === "community" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>社区连接</h2>
            <label className="label" htmlFor="access-token">Access Token</label>
            <input
              id="access-token"
              aria-label="Access Token"
              className="input"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="wd_..."
              style={{ width: "min(100%, 360px)" }}
            />
            <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                disabled={!token.trim()}
                onClick={() => {
                  setTokenStatus("Token 已保存 · Push 权限正常");
                  onCommunityConnected(true);
                  onToast({ kind: "save", text: "Token 已保存" });
                }}
              >
                保存 Token
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setTokenStatus("已断开社区连接");
                  onCommunityConnected(false);
                  onToast({ kind: "warn", text: "已断开社区连接" });
                }}
              >
                断开连接
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 13 }}>{tokenStatus}</div>
          </section>
        )}
        {tab === "data" && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="title-font" style={{ marginTop: 0 }}>导入导出</h2>
            <button className="btn"><Icon name="download" size={12} /><span>导出世界包</span></button>
            <button className="btn" style={{ marginLeft: 8 }}><Icon name="upload" size={12} /><span>导入世界包</span></button>
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
      <span>{label}</span>
      <span className="mono">{value}</span>
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
