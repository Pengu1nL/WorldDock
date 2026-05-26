import { useState } from "react";
import type { World, WorldMode } from "./domain";
import { Icon } from "./components";

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

type PublishViewProps = {
  mode: WorldMode;
  world: World;
  communityConnected?: boolean;
  onBack: () => void;
  onConfirm: (payload: { releaseNote: string; license: string }) => void;
};

export function PublishView({
  mode,
  world,
  communityConnected = true,
  onBack,
  onConfirm,
}: PublishViewProps) {
  const [releaseNote, setReleaseNote] = useState("");
  const [license, setLicense] = useState("non-commercial-attribution");
  const isLocal = mode === "local";
  const blocked = isLocal && !communityConnected;

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
        <section className="card" style={{ padding: 16 }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>将公开</h2>
          <div className="col" style={{ gap: 8 }}>
            {PUBLIC_ITEMS.map((item) => (
              <div key={item} className="row gap-2" style={{ fontSize: 13 }}>
                <Icon name="check" size={12} style={{ color: "var(--sage)" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 16, borderColor: "var(--amber-dim)" }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>不会公开</h2>
          <div className="col" style={{ gap: 8 }}>
            {PRIVATE_ITEMS.map((item) => (
              <div key={item} className="row gap-2" style={{ fontSize: 13 }}>
                <Icon name="eyeoff" size={12} style={{ color: "var(--amber)" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <h2 className="title-font" style={{ fontSize: "var(--t-18)", marginTop: 0 }}>实体级差异预览</h2>
          <div className="col" style={{ gap: 8 }}>
            <DiffRow label="新增设定" value={Math.max(1, world.archive)} />
            <DiffRow label="修改设定" value={2} />
            <DiffRow label="删除设定" value={0} />
            <DiffRow label="新增故事种子" value={Math.max(1, world.seeds)} />
          </div>
        </section>

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
          {blocked && (
            <div className="badge amber" style={{ height: 22, marginTop: 12 }}>
              本地未连接社区，无法 Push
            </div>
          )}
          <button
            className="btn primary lg"
            disabled={!releaseNote.trim() || blocked}
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

type DiffRowProps = {
  label: string;
  value: number;
};

function DiffRow({ label, value }: DiffRowProps) {
  return (
    <div className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13 }}>
      <span>{label}</span>
      <span className="badge slate">{value}</span>
    </div>
  );
}
