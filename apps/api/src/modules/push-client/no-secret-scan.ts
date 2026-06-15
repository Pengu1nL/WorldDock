import type { ReleaseSnapshot } from "@worlddock/contract/releases";

export type SecretScanFinding = {
  path: string;
  reason: "api_key" | "env_file" | "private_key" | "token";
  excerpt: string;
};

type SecretPattern = {
  needle: string;
  reason: SecretScanFinding["reason"];
};

type PackageAsset = ReleaseSnapshot["package"]["assets"][number];
type SnapshotAsset = ReleaseSnapshot["assets"][number];

const SECRET_PATTERNS: SecretPattern[] = [
  { needle: "OPENAI_API_KEY=", reason: "api_key" },
  { needle: "PI_PROVIDER_API_KEY=", reason: "api_key" },
  { needle: "ANTHROPIC_API_KEY=", reason: "api_key" },
  { needle: "AWS_SECRET_ACCESS_KEY=", reason: "api_key" },
  { needle: "DATABASE_URL=", reason: "token" },
  { needle: "GITHUB_TOKEN=", reason: "token" },
  { needle: "-----BEGIN PRIVATE KEY-----", reason: "private_key" },
  { needle: ".env", reason: "env_file" },
  { needle: "Bearer sk-", reason: "token" },
  { needle: "ghp_", reason: "token" },
  { needle: "sk-", reason: "token" },
];

export function scanReleaseSnapshotForSecrets(snapshot: ReleaseSnapshot): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];

  scanText(findings, "repository.owner", snapshot.repository.owner);
  scanText(findings, "repository.slug", snapshot.repository.slug);
  scanText(findings, "repository.name", snapshot.repository.name);
  scanUnknown(findings, "package.world", snapshot.package.world);
  snapshot.package.assets.forEach((asset, index) => {
    scanAssetFields(findings, `package.assets[${index}]`, asset);
  });

  snapshot.assets.forEach((asset, index) => {
    scanAssetFields(findings, `assets[${index}]`, asset);
  });

  return findings;
}

function scanAssetFields(findings: SecretScanFinding[], path: string, asset: PackageAsset | SnapshotAsset) {
  if ("name" in asset) {
    scanText(findings, `${path}.name`, asset.name);
    scanText(findings, `${path}.summary`, asset.summary);
    scanText(findings, `${path}.markdown`, asset.markdown);
    scanUnknown(findings, `${path}.tags`, asset.tags);
    scanUnknown(findings, `${path}.metadata`, asset.metadata);
    return;
  }

  scanText(findings, `${path}.title`, asset.title);
  scanText(findings, `${path}.summary`, asset.summary);
  if (asset.body) scanText(findings, `${path}.body`, asset.body);
  scanUnknown(findings, `${path}.payload`, asset.payload);
}

function scanUnknown(findings: SecretScanFinding[], path: string, value: unknown) {
  if (typeof value === "string") {
    scanText(findings, path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanUnknown(findings, `${path}[${index}]`, item));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      scanUnknown(findings, `${path}.${key}`, item);
    }
  }
}

function scanText(findings: SecretScanFinding[], path: string, value: string) {
  for (const pattern of SECRET_PATTERNS) {
    if (!value.includes(pattern.needle)) continue;
    findings.push({
      path,
      reason: pattern.reason,
      excerpt: `<redacted:${pattern.reason}>`,
    });
  }
}
