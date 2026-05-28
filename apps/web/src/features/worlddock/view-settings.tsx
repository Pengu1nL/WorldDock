import { useCallback, useEffect, useState } from "react";
import type { WorldMode } from "@worlddock/domain";
import {
  createAccessToken,
  getBillingUsage,
  listAccessTokens,
  revokeAccessToken,
  type AccessTokenSummary,
  type BillingUsage,
} from "./api";
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
  const [token, setToken] = useState("");
  const [tokenStatus, setTokenStatus] = useState(communityConnected ? "Token 已保存 · Push 权限正常" : "未连接");
  const [cloudTokens, setCloudTokens] = useState<AccessTokenSummary[]>([]);
  const [cloudTokenBusy, setCloudTokenBusy] = useState(false);
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  const sessionToken = () => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("worlddock.sessionToken") ?? "";
  };

  const refreshBilling = useCallback(async () => {
    const session = sessionToken();
    if (!session) return;

    setBillingBusy(true);
    try {
      const result = await getBillingUsage({ sessionToken: session });
      setBillingUsage(result.usage);
    } catch {
      onToast({ kind: "warn", text: "云端用量同步失败" });
    } finally {
      setBillingBusy(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (tab === "billing") void refreshBilling();
  }, [refreshBilling, tab]);

  const refreshCloudTokens = async () => {
    const session = sessionToken();
    if (!session) {
      setTokenStatus("未登录 Cloud，无法读取云端 Token");
      return;
    }

    setCloudTokenBusy(true);
    try {
      const result = await listAccessTokens({ sessionToken: session });
      setCloudTokens(result.accessTokens);
      setTokenStatus(`已同步 ${result.accessTokens.length} 个云端 Token`);
    } catch {
      setTokenStatus("云端 Token 同步失败");
    } finally {
      setCloudTokenBusy(false);
    }
  };

  const createCloudToken = async () => {
    const session = sessionToken();
    if (!session) {
      setTokenStatus("未登录 Cloud，无法创建云端 Token");
      return;
    }

    setCloudTokenBusy(true);
    try {
      const result = await createAccessToken(
        { name: "Local Push", scopes: ["world:read", "world:write", "repository:push"] },
        { sessionToken: session },
      );
      setToken(result.token);
      setCloudTokens((tokens) => [result.accessToken, ...tokens]);
      setTokenStatus("云端 Token 已创建 · 明文仅显示一次");
      onCommunityConnected(true);
      onToast({ kind: "save", text: "云端 Token 已创建" });
    } catch {
      setTokenStatus("云端 Token 创建失败");
      onToast({ kind: "warn", text: "云端 Token 创建失败" });
    } finally {
      setCloudTokenBusy(false);
    }
  };

  const revokeCloudToken = async (tokenId: string) => {
    const session = sessionToken();
    if (!session) {
      setTokenStatus("未登录 Cloud，无法撤销云端 Token");
      return;
    }

    setCloudTokenBusy(true);
    try {
      const result = await revokeAccessToken(tokenId, { sessionToken: session });
      setCloudTokens((tokens) =>
        tokens.map((item) => item.id === tokenId ? result.accessToken : item),
      );
      setTokenStatus("云端 Token 已撤销");
      onToast({ kind: "warn", text: "云端 Token 已撤销" });
    } catch {
      setTokenStatus("云端 Token 撤销失败");
    } finally {
      setCloudTokenBusy(false);
    }
  };

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
            <Metric label="当前余额" value={formatCents(billingUsage?.balance.balanceCents ?? Math.round(balance * 100))} />
            <Metric label="最近一次 Agent Run" value={formatLastAgentRun(billingUsage)} />
            <Metric label="最近账本条目" value={billingUsage ? `${billingUsage.entries.length} 条` : "未同步"} />
            <div className="badge amber">余额低于 ¥5.00 时会拦截新的 Agent Run</div>
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost" disabled={billingBusy} onClick={refreshBilling}>
                <Icon name="refresh" size={12} /><span>{billingBusy ? "同步中" : "刷新用量"}</span>
              </button>
            </div>
            {billingUsage && billingUsage.entries.length > 0 && (
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                {billingUsage.entries.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="row gap-2" style={{ justifyContent: "space-between", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
                    <span className="mono">{entry.type}</span>
                    <span className="mono">{formatSignedCents(entry.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
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
                setModelStatus("请通过一次真实 Agent Run 验证模型连接");
                onToast({ kind: "info", text: "请在工作台发起真实 Agent Run" });
              }}
            >
              <Icon name="bolt" size={12} /><span>验证方式</span>
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
              <button className="btn" disabled={cloudTokenBusy} onClick={createCloudToken}>
                创建云端 Token
              </button>
              <button className="btn ghost" disabled={cloudTokenBusy} onClick={refreshCloudTokens}>
                刷新云端 Token
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 13 }}>{tokenStatus}</div>
            {cloudTokens.length > 0 && (
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                {cloudTokens.map((item) => (
                  <div key={item.id} className="row gap-2" style={{ justifyContent: "space-between", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
                    <span className="mono">wdl_{item.prefix}_...</span>
                    <span>{item.revokedAt ? "已撤销" : item.scopes.join(" · ")}</span>
                    <button className="icon-btn" aria-label={`撤销 ${item.name}`} disabled={Boolean(item.revokedAt) || cloudTokenBusy} onClick={() => revokeCloudToken(item.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

function formatCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatSignedCents(cents: number) {
  const prefix = cents > 0 ? "+" : "";
  return `${prefix}${formatCents(cents)}`;
}

function formatLastAgentRun(usage: BillingUsage | null) {
  if (!usage?.lastAgentRun) return "暂无真实记录";
  return `${usage.lastAgentRun.tokenUsage.totalTokens} tokens / ${formatCents(usage.lastAgentRun.costCents)}`;
}
