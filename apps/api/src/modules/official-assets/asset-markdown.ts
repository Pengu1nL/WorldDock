import type { OfficialWorldAssetType } from "@worlddock/contract/assets";

const ASSET_SECTIONS: Record<OfficialWorldAssetType, string[]> = {
  character: ["概括", "身份与背景", "目标与动机", "能力与限制", "关系网络", "已确认事实"],
  organization: ["概括", "类型与定位", "目标与利益", "结构与成员", "资源与能力", "对外关系", "已确认事实"],
  location: ["概括", "空间特征", "功能与资源", "居住者或控制者", "规则与风险", "相关事件", "已确认事实"],
  event: ["概括", "时间与阶段", "参与方", "经过", "结果与影响", "牵连", "已确认事实"],
  rule: ["概括", "适用范围", "运作机制", "限制与代价", "例外情况", "对世界的影响", "已确认事实"],
};

export type InitialAssetMarkdownInput = {
  type: OfficialWorldAssetType;
  name: string;
  summary: string;
};

export type MarkdownSectionIndex = {
  heading: string;
  level: number;
  summary: string | null;
};

export function buildInitialAssetMarkdown(input: InitialAssetMarkdownInput) {
  const lines = [`# ${input.name.trim()}`, ""];
  for (const section of ASSET_SECTIONS[input.type]) {
    lines.push(`## ${section}`, "");
    lines.push(section === "概括" ? input.summary.trim() : "待补充。", "");
  }
  return lines.join("\n").trimEnd();
}

export function extractAssetSummary(markdown: string) {
  const section = findSection(markdown, 2, "概括");
  return section?.content.trim() ?? "";
}

export function indexMarkdownSections(markdown: string): MarkdownSectionIndex[] {
  const sections = findSections(markdown);
  return sections.map((section) => ({
    heading: section.heading,
    level: section.level,
    summary: summarizeSectionContent(section.content),
  }));
}

type ParsedSection = {
  heading: string;
  level: number;
  content: string;
};

function findSection(markdown: string, level: number, heading: string) {
  return findSections(markdown).find((section) => section.level === level && section.heading === heading);
}

function findSections(markdown: string): ParsedSection[] {
  const lines = markdown.split(/\r?\n/);
  const headings: Array<{ heading: string; level: number; lineIndex: number }> = [];
  let fenced = false;

  lines.forEach((line, lineIndex) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    headings.push({
      heading: match[2].trim(),
      level: match[1].length,
      lineIndex,
    });
  });

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const content = lines.slice(heading.lineIndex + 1, next?.lineIndex).join("\n");
    return {
      heading: heading.heading,
      level: heading.level,
      content,
    };
  });
}

function summarizeSectionContent(content: string) {
  const normalized = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return normalized || null;
}
