import { z } from "zod";
import { officialWorldPackageAssetSchema, worldPackageSchema } from "../worlds/world-package.js";

export const contractVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const legacyReleaseSnapshotAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["setting", "seed", "conflict"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  contentHash: z.string().min(1).optional(),
});

export const officialReleaseSnapshotAssetSchema = officialWorldPackageAssetSchema.extend({
  id: z.string().min(1),
  contentHash: z.string().min(1).optional(),
});

export const releaseSnapshotAssetSchema = z.union([
  legacyReleaseSnapshotAssetSchema,
  officialReleaseSnapshotAssetSchema,
]);

export const releaseSnapshotRepositorySchema = z.object({
  owner: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const releaseSnapshotSchema = z.object({
  contractVersion: contractVersionSchema,
  repository: releaseSnapshotRepositorySchema,
  package: worldPackageSchema,
  assets: z.array(releaseSnapshotAssetSchema).default([]),
  createdAt: z.string().datetime(),
}).superRefine((snapshot, context) => {
  if (snapshot.package.format === "worlddock.world-package.v1") {
    snapshot.assets.forEach((asset, index) => {
      if (!isLegacyReleaseSnapshotAsset(asset)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index],
          message: "World package v1 release snapshots only support legacy assets.",
        });
      }
    });
    return;
  }

  if (snapshot.assets.length !== snapshot.package.assets.length) {
    context.addIssue({
      code: "custom",
      path: ["assets"],
      message: "World package v2 release snapshots must align package assets with snapshot assets.",
    });
    return;
  }

  snapshot.assets.forEach((asset, index) => {
    if (isLegacyReleaseSnapshotAsset(asset)) {
      context.addIssue({
        code: "custom",
        path: ["assets", index],
        message: "World package v2 release snapshots only support official assets.",
      });
      return;
    }

    const packageAsset = snapshot.package.assets[index];
    if (!packageAsset || !("type" in packageAsset)) {
      context.addIssue({
        code: "custom",
        path: ["package", "assets", index],
        message: "World package v2 release snapshots only support official package assets.",
      });
      return;
    }

    if (!officialAssetCoreEquals(packageAsset, asset)) {
      context.addIssue({
        code: "custom",
        path: ["assets", index],
        message: "World package v2 snapshot asset must match the package asset at the same index.",
      });
    }
  });
});

export type ReleaseSnapshot = z.infer<typeof releaseSnapshotSchema>;
export type ReleaseSnapshotAsset = z.infer<typeof releaseSnapshotAssetSchema>;
export type LegacyReleaseSnapshotAsset = z.infer<typeof legacyReleaseSnapshotAssetSchema>;
export type OfficialReleaseSnapshotAsset = z.infer<typeof officialReleaseSnapshotAssetSchema>;
export type ReleaseSnapshotRepository = z.infer<typeof releaseSnapshotRepositorySchema>;

function isLegacyReleaseSnapshotAsset(asset: ReleaseSnapshotAsset): asset is LegacyReleaseSnapshotAsset {
  return "kind" in asset;
}

function officialAssetCoreEquals(
  packageAsset: z.infer<typeof officialWorldPackageAssetSchema>,
  snapshotAsset: OfficialReleaseSnapshotAsset,
) {
  return packageAsset.type === snapshotAsset.type &&
    packageAsset.name === snapshotAsset.name &&
    packageAsset.summary === snapshotAsset.summary &&
    packageAsset.markdown === snapshotAsset.markdown &&
    deepEqual(packageAsset.tags, snapshotAsset.tags) &&
    deepEqual(packageAsset.metadata, snapshotAsset.metadata) &&
    packageAsset.status === snapshotAsset.status &&
    packageAsset.version === snapshotAsset.version;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    if (leftEntries.length !== rightEntries.length) return false;
    return leftEntries.every(([key, value], index) => key === rightEntries[index][0] && deepEqual(value, rightEntries[index][1]));
  }
  return false;
}
