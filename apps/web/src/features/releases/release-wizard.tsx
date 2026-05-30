import { useEffect, useMemo, useState } from "react";
import type { ReleasePreflight, World, WorldMode } from "@worlddock/domain";
import { previewWorldRelease } from "../worlddock/api";
import { Icon } from "../worlddock/components";
import { DiffView, type ReleaseDiffItem } from "./diff-view";

const PUBLIC_ITEMS = [
  "世界总览",
  "已确认世界规则",
  "已确认势力",
  "已确认角色",
  "已确认冲突",
  "已确认故事种子",
  "README",
  "标签",
  "授权设置",
];

const PRIVATE_ITEMS = [
  "原始对话记录",
  "本地草稿",
  "未确认设定",
  "私密备注",
  "模型配置",
  "API Key",
  "本地日志",
  "token 记录",
];

type ReleaseWizardProps = {
  mode: WorldMode;
  world: World;
  sessionToken: string;
  communityConnected?: boolean;
  hasPublicPublishingEntitlement?: boolean;
  onBack: () => void;
  onConfirm: (payload: { releaseNote: string; license: string }) => Promise<void> | void;
};

export function ReleaseWizard({
  mode,
  world,
  sessionToken,
  communityConnected = true,
  hasPublicPublishingEntitlement = true,
  onBack,
  onConfirm,
}: ReleaseWizardProps) {
  const [releaseNote, setReleaseNote] = useState("");
  const [license, setLicense] = useState("non-commercial-attribution");
  const [preflight, setPreflight] = useState<ReleasePreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  const isLocal = mode === "local";
  const assetCount = (world.archive ?? 0) + (world.seeds ?? 0) + (world.conflicts ?? 0);
  const moderationOk = !["malware", "credential leak", "api key", "spam-only"].some((term) =>
    `${world.name}\n${world.summary}\n${releaseNote}`.toLowerCase().includes(term),
  );
  const blocked = isLocal && !communityConnected;

  useEffect(() => {
    if (isLocal || !sessionToken || !world.id) {
      setPreflight(null);
      setPreflightLoading(false);
      setPreflightError("");
      return;
    }

    const controller = new AbortController();
    setPreflight(null);
    setPreflightLoading(true);
    setPreflightError("");
    const timeout = window.setTimeout(() => {
      void previewWorldRelease(world.id, { releaseNote, license }, { sessionToken, signal: controller.signal })
        .then((result) => setPreflight(result.preflight))
        .catch((error) => {
          if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") return;
          setPreflightError("发布前检查暂不可用");
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreflightLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isLocal, license, releaseNote, sessionToken, world.id]);

  const checks = useMemo(() => {
    if (!isLocal && preflight) {
      return preflight.checks.map((check) => ({ id: check.code, ok: check.ok, label: check.message }));
    }
    return [
      { id: "assets", ok: assetCount > 0, label: "至少保存一个世界资产" },
      { id: "license", ok: Boolean(license), label: "已选择授权方式" },
      { id: "release_note", ok: Boolean(releaseNote.trim()), label: "已填写发布说明" },
      { id: "moderation", ok: moderationOk, label: "发布前预扫描通过" },
      { id: "entitlement", ok: hasPublicPublishingEntitlement, label: "账户包含公开发布权益" },
    ];
  }, [assetCount, hasPublicPublishingEntitlement, isLocal, license, moderationOk, preflight, releaseNote]);
  const canSubmit = !blocked
    && !preflightLoading
    && !preflightError
    && (isLocal ? checks.every((check) => check.ok) : preflight?.ok === true);
  const diff: ReleaseDiffItem[] = preflight !== null
    ? [
        { label: "新增资产", value: preflight.changes.filter((change) => change.kind === "added").length, tone: "sage" },
        { label: "修改资产", value: preflight.changes.filter((change) => change.kind === "changed").length },
        { label: "删除资产", value: preflight.changes.filter((change) => change.kind === "removed").length, tone: "amber" },
      ]
    : [
        { label: "新增设定", value: world.archive ?? 0, tone: "sage" },
        { label: "修改设定", value: world.status === "published" ? Math.max(0, world.archive ?? 0) : 0 },
        { label: "删除设定", value: 0 },
        { label: "新增故事种子", value: world.seeds ?? 0, tone: "sage" },
      ];

  return (
    <div className="view-scroll" style={{ flex: 1, minHeight: 0 }}>
      <div className="page-head">
        <div className="col">
          <div className="crumb">
            / ren / {world.name} / <span style={{ color: "var(--fg-1)" }}>{isLocal ? "push" : "publish"}</span>
          </div>
          <h1>{isLocal ? "Push 到界仓" : "发布世界"}</h1>
          <div className="sub">
            {isLocal ? "Local Push 是公开快照，不是完整云同步。" : "Cloud Publish 会生成公开世界仓库快照。"}
          </div>
        </div>
        <button className="btn ghost" onClick={onBack}>返回工作台</button>
      </div>

      <div
        style={{
          padding: "20px 32px 40px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <DiffView publicItems={PUBLIC_ITEMS} privateItems={PRIVATE_ITEMS} diff={diff} />

        <section className="card" style={{ padding: 16 }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>发布信息</h2>
          <label className="label" htmlFor="release-note">更新说明</label>
          <textarea
            id="release-note"
            aria-label="更新说明"
            className="textarea"
            value={releaseNote}
            onChange={(event) => setReleaseNote(event.target.value)}
            rows={4}
          />
          <label className="label" htmlFor="license" style={{ marginTop: 12 }}>授权方式</label>
          <select
            id="license"
            aria-label="授权方式"
            className="input"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
          >
            <option value="all-rights-reserved">保留所有权利</option>
            <option value="non-commercial-attribution">允许非商业再创作，需署名</option>
            <option value="free-fork-attribution">允许自由 Fork，需署名</option>
            <option value="commercial-attribution">允许商业使用，需署名</option>
            <option value="no-fork">禁止 Fork，仅可浏览</option>
          </select>
          <div className="col" style={{ gap: 8, marginTop: 14 }}>
            {checks.map((check) => (
              <div key={check.id} className={`badge ${check.ok ? "sage" : "amber"}`} style={{ justifyContent: "flex-start", height: 24 }}>
                <Icon name={check.ok ? "check" : "info"} size={12} />
                <span>{check.label}</span>
              </div>
            ))}
            {blocked && (
              <div className="badge amber" style={{ justifyContent: "flex-start", height: 24 }}>
                本地未连接社区，无法 Push
              </div>
            )}
            {preflightLoading ? <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>发布前检查中</div> : null}
            {preflightError ? <div className="badge amber" style={{ justifyContent: "flex-start", minHeight: 24 }}>{preflightError}</div> : null}
          </div>
          <button
            className="btn primary lg"
            disabled={!canSubmit}
            onClick={() => onConfirm({ releaseNote, license })}
            style={{ marginTop: 16 }}
          >
            <Icon name={isLocal ? "push" : "upload"} size={13} />
            <span>{isLocal ? "确认 Push" : "确认发布"}</span>
          </button>
        </section>
      </div>
    </div>
  );
}
