import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { pushReleaseRequestSchema, pushReleaseResponseSchema, type PushReleaseResponse } from "@worlddock/contract/hub-api";
import { releaseSnapshotSchema, type ReleaseSnapshot } from "@worlddock/contract/releases";
import { z } from "zod";
import { ConnectionsService } from "../connections/connections.service";
import { ExportsService } from "../exports/exports.service";
import { scanReleaseSnapshotForSecrets } from "./no-secret-scan";

export const PUSH_CLIENT_FETCH = Symbol("PUSH_CLIENT_FETCH");
export type PushClientFetch = typeof fetch;
const HUB_PUSH_TIMEOUT_MS = 5000;

export type PushWorldInput = {
  worldId: string;
  owner: string;
  slug: string;
  note?: string;
  selectedAssetIds: string[];
  allowSecretFindings?: boolean;
};

const pushWorldInputSchema = z.object({
  worldId: z.string().min(1),
  owner: z.string().min(1),
  slug: z.string().min(1),
  note: z.string().max(4000).optional(),
  selectedAssetIds: z.array(z.string().min(1)).min(1),
  allowSecretFindings: z.boolean().default(false),
}).strict();

@Injectable()
export class PushClientService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly exportsService: ExportsService,
    @Inject(PUSH_CLIENT_FETCH) private readonly hubFetch: PushClientFetch,
  ) {}

  async pushWorld(input: PushWorldInput): Promise<PushReleaseResponse> {
    const parsed = pushWorldInputSchema.parse(input);
    const connection = await this.connections.getInternalHubConnection();
    if (!connection) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Hub connection is not configured.",
      });
    }

    const snapshot = filterReleaseSnapshot(
      await this.exportsService.buildReleaseSnapshot({
        worldId: parsed.worldId,
        owner: parsed.owner,
        slug: parsed.slug,
      }),
      parsed.selectedAssetIds,
    );
    const findings = scanReleaseSnapshotForSecrets(snapshot);
    if (findings.length > 0 && !parsed.allowSecretFindings) {
      throw new BadRequestException({
        code: "SECRET_FINDINGS_BLOCKED",
        message: "Selected release contains possible secrets.",
        details: { findings },
      });
    }

    const requestBody = pushReleaseRequestSchema.parse({
      snapshot,
      note: parsed.note ?? "",
    });
    const response = await this.postRelease(connection.hubUrl, connection.token, parsed.owner, parsed.slug, requestBody);
    const responseBody = await readJson(response);
    const parsedResponse = pushReleaseResponseSchema.safeParse(responseBody);
    if (!parsedResponse.success) {
      throw new BadGatewayException({
        code: "HUB_PUSH_INVALID_RESPONSE",
        message: "WorldHub returned an invalid push response.",
        details: {
          issues: parsedResponse.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    return parsedResponse.data;
  }

  private async postRelease(
    hubUrl: string,
    token: string,
    owner: string,
    slug: string,
    requestBody: z.infer<typeof pushReleaseRequestSchema>,
  ) {
    let response: Response;
    try {
      response = await this.hubFetch(`${trimTrailingSlashes(hubUrl)}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/releases`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(HUB_PUSH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException({
        code: "HUB_PUSH_FAILED",
        message: "WorldHub push request failed.",
        details: { reason: "request_failed" },
      });
    }

    if (!response.ok) {
      throw new BadGatewayException({
        code: "HUB_PUSH_FAILED",
        message: "WorldHub push request failed.",
        details: { status: response.status },
      });
    }

    return response;
  }
}

function filterReleaseSnapshot(snapshot: ReleaseSnapshot, selectedAssetIds: string[]) {
  const selected = new Set(selectedAssetIds);
  const known = new Set(snapshot.assets.map((asset) => asset.id));
  const missing = selectedAssetIds.filter((assetId) => !known.has(assetId));
  if (missing.length > 0) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "Selected assets were not found.",
      details: { assetIds: missing },
    });
  }

  const selectedIndexes = snapshot.assets
    .map((asset, index) => selected.has(asset.id) ? index : -1)
    .filter((index) => index >= 0);
  const packageAssets = selectedIndexes
    .map((index) => snapshot.package.assets[index])
    .filter((asset): asset is ReleaseSnapshot["package"]["assets"][number] => Boolean(asset));

  return releaseSnapshotSchema.parse({
    ...snapshot,
    package: {
      ...snapshot.package,
      assets: packageAssets,
    },
    assets: selectedIndexes.map((index) => snapshot.assets[index]),
  });
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new BadGatewayException({
      code: "HUB_PUSH_INVALID_RESPONSE",
      message: "WorldHub returned a non-JSON push response.",
    });
  }
}

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}
