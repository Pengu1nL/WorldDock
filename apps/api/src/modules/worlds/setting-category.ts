export function normalizeSettingCategory(category: string | undefined, title: string, summary: string, body: string) {
  const normalizedCategory = readText(category, "待定设定");
  if (!isGenericSettingCategory(normalizedCategory)) return normalizedCategory;
  if (looksLikeFactionSetting(title, summary, body)) return "势力";
  return normalizedCategory;
}

function isGenericSettingCategory(category: string) {
  return category === "世界规则" || category === "待定设定";
}

function looksLikeFactionSetting(title: string, summary: string, _body: string) {
  const normalizedTitle = title.trim();
  const identityText = `${title}\n${summary}`;
  const organizationTerms = "公司|企业|集团|财团|联盟|联合体|组织|机构|基金会|委员会|商会|工会|教团|军团|舰队|政府|财阀|银行|研究院|Consortium|Company|Corporation|Foundation|Agency|Authority|Union|Alliance|Guild|Syndicate|Collective";
  const titlePattern = new RegExp(`^[^\\n：:]{2,30}(?:${organizationTerms}|联合)(?:[：:\\s]|$)`, "i");
  const identityPattern = new RegExp(`(?:是|为|作为|属于|隶属于).{0,40}(?:${organizationTerms})`, "i");
  return titlePattern.test(normalizedTitle) || identityPattern.test(identityText);
}

function readText(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}
