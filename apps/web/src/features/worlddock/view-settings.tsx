import { useEffect, useState } from "react";
import { ImportExportPanel } from "../worlds/import-export-panel";
import {
  deleteHubConnection,
  getHubConnection,
  saveHubConnection,
  testHubConnection,
  type HubConnectionResponse,
  type SaveHubConnectionInput,
} from "./api";
import { Icon } from "./components";

type SettingsViewProps = {
  currentWorld?: { id: string; name: string } | null;
  onBack: () => void;
  onToast: (toast: { kind: "save" | "warn" | "info"; text: string }) => void;
  hubApi?: HubConnectionApi;
};

type HubConnectionApi = {
  getHubConnection: () => Promise<HubConnectionResponse>;
  saveHubConnection: (input: SaveHubConnectionInput) => Promise<HubConnectionResponse>;
  deleteHubConnection: () => Promise<HubConnectionResponse>;
  testHubConnection: () => Promise<{ ok: true }>;
};

const defaultHubApi: HubConnectionApi = {
  getHubConnection,
  saveHubConnection,
  deleteHubConnection,
  testHubConnection,
};

export function SettingsView({
  currentWorld,
  onBack,
  onToast,
  hubApi = defaultHubApi,
}: SettingsViewProps) {
  const [tab, setTab] = useState("model");
  const [modelStatus, setModelStatus] = useState("未验证");
  const [hubUrl, setHubUrl] = useState("");
  const [pat, setPat] = useState("");
  const [tokenPrefix, setTokenPrefix] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(true);
  const [hubSaving, setHubSaving] = useState(false);
  const [hubTesting, setHubTesting] = useState(false);
  const [hubDisconnecting, setHubDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHubLoading(true);
    hubApi.getHubConnection()
      .then((result) => {
        if (cancelled) return;
        setHubUrl(result.connection?.hubUrl ?? "");
        setTokenPrefix(safeTokenPrefix(result.connection?.tokenPrefix));
        setPat("");
      })
      .catch(() => {
        if (!cancelled) onToast({ kind: "warn", text: "界仓连接读取失败" });
      })
      .finally(() => {
        if (!cancelled) setHubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hubApi, onToast]);

  const saveHub = async () => {
    if (!hubUrl.trim() || !pat.trim()) {
      onToast({ kind: "warn", text: "请填写 Hub URL 和 PAT" });
      return;
    }
    setHubSaving(true);
    try {
      const result = await hubApi.saveHubConnection({ hubUrl: hubUrl.trim(), token: pat.trim() });
      setHubUrl(result.connection?.hubUrl ?? hubUrl.trim());
      setTokenPrefix(safeTokenPrefix(result.connection?.tokenPrefix));
      setPat("");
      onToast({ kind: "save", text: "界仓连接已保存" });
    } catch {
      onToast({ kind: "warn", text: "界仓连接保存失败" });
    } finally {
      setHubSaving(false);
    }
  };

  const testHub = async () => {
    setHubTesting(true);
    try {
      await hubApi.testHubConnection();
      onToast({ kind: "save", text: "界仓连接可用" });
    } catch {
      onToast({ kind: "warn", text: "界仓连接测试失败" });
    } finally {
      setHubTesting(false);
    }
  };

  const disconnectHub = async () => {
    setHubDisconnecting(true);
    try {
      await hubApi.deleteHubConnection();
      setHubUrl("");
      setTokenPrefix(null);
      setPat("");
      onToast({ kind: "warn", text: "界仓连接已断开" });
    } catch {
      onToast({ kind: "warn", text: "断开界仓失败" });
    } finally {
      setHubDisconnecting(false);
    }
  };

  const hubBusy = hubLoading || hubSaving || hubTesting || hubDisconnecting;

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
          ["hub", "界仓"],
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
            <Field label="AI_PROVIDER" value="pi" />
            <Field label="PI_MODEL_PROVIDER" value="服务端环境变量" />
            <Field label="PI_MODEL_ID" value="服务端环境变量" />
            <Field label="PI_PROVIDER_API_KEY" value="服务端环境变量" />
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
        {tab === "hub" && (
          <section className="card" style={{ padding: 18 }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <h2 className="title-font" style={{ marginTop: 0 }}>界仓连接</h2>
                <div style={{ marginTop: 6 }}>
                  {tokenPrefix ? (
                    <span className="badge sage">PAT {tokenPrefix}...</span>
                  ) : (
                    <span className="badge slate">未连接</span>
                  )}
                </div>
              </div>
              {hubLoading ? <span className="badge amber">读取中</span> : null}
            </div>

            <div className="col gap-3" style={{ maxWidth: 520 }}>
              <label>
                <span className="label">Hub URL</span>
                <input
                  className="input"
                  aria-label="Hub URL"
                  placeholder="https://hub.worlddock.example"
                  value={hubUrl}
                  onChange={(event) => setHubUrl(event.target.value)}
                  disabled={hubLoading}
                />
              </label>
              <label>
                <span className="label">PAT</span>
                <input
                  className="input"
                  aria-label="PAT"
                  type="password"
                  autoComplete="off"
                  placeholder={tokenPrefix ? `已保存：${tokenPrefix}...` : "wdpat_..."}
                  value={pat}
                  onChange={(event) => setPat(event.target.value)}
                  disabled={hubLoading}
                />
              </label>
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <button className="btn primary" onClick={saveHub} disabled={hubBusy || !hubUrl.trim() || !pat.trim()}>
                  <Icon name="save" size={12} /><span>{hubSaving ? "保存中" : "Save"}</span>
                </button>
                <button className="btn" onClick={testHub} disabled={hubBusy || !tokenPrefix}>
                  <Icon name="bolt" size={12} /><span>{hubTesting ? "测试中" : "Test connection"}</span>
                </button>
                <button className="btn danger" onClick={disconnectHub} disabled={hubBusy || !tokenPrefix}>
                  <Icon name="trash" size={12} /><span>{hubDisconnecting ? "断开中" : "Disconnect"}</span>
                </button>
              </div>
            </div>
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

function safeTokenPrefix(value: string | undefined | null) {
  if (!value) return null;
  return value.slice(0, 8);
}
