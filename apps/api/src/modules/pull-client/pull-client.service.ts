import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { pullRepositoryResponseSchema, type PullRepositoryResponse } from "@worlddock/contract/hub-api";
import { z } from "zod";
import { ConnectionsService } from "../connections/connections.service";
import { ExportsService } from "../exports/exports.service";
import { repoPathSegmentSchema } from "../repo-path-segment";

export const PULL_CLIENT_FETCH = Symbol("PULL_CLIENT_FETCH");
export type PullClientFetch = typeof fetch;
const HUB_PULL_TIMEOUT_MS = 5000;

export type PullWorldInput = {
  owner: string;
  slug: string;
};

const pullWorldInputSchema = z.object({
  owner: repoPathSegmentSchema,
  slug: repoPathSegmentSchema,
}).strict();

@Injectable()
export class PullClientService {
  constructor(
    @Inject(ConnectionsService) private readonly connections: ConnectionsService,
    @Inject(ExportsService) private readonly exportsService: ExportsService,
    @Inject(PULL_CLIENT_FETCH) private readonly hubFetch: PullClientFetch,
  ) {}

  async pullWorld(input: PullWorldInput) {
    const parsed = parsePullWorldInput(input);
    const connection = await this.connections.getInternalHubConnection();
    if (!connection) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Hub connection is not configured.",
      });
    }

    const response = await this.getRepository(connection.hubUrl, connection.token, parsed.owner, parsed.slug);
    const responseBody = await readJson(response);
    const parsedResponse = pullRepositoryResponseSchema.safeParse(responseBody);
    if (!parsedResponse.success) {
      throw new BadGatewayException({
        code: "HUB_PULL_INVALID_RESPONSE",
        message: "WorldHub returned an invalid pull response.",
        details: {
          issues: parsedResponse.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    return this.importPulledRepository(parsedResponse.data);
  }

  private async getRepository(hubUrl: string, token: string, owner: string, slug: string) {
    let response: Response;
    try {
      response = await this.hubFetch(`${trimTrailingSlashes(hubUrl)}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/pull`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(HUB_PULL_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException({
        code: "HUB_PULL_FAILED",
        message: "WorldHub pull request failed.",
        details: { reason: "request_failed" },
      });
    }

    if (!response.ok) {
      throw new BadGatewayException({
        code: "HUB_PULL_FAILED",
        message: "WorldHub pull request failed.",
        details: { status: response.status },
      });
    }

    return response;
  }

  private importPulledRepository(response: PullRepositoryResponse) {
    return this.exportsService.importReleaseSnapshot({ snapshot: response.snapshot });
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new BadGatewayException({
      code: "HUB_PULL_INVALID_RESPONSE",
      message: "WorldHub returned a non-JSON pull response.",
    });
  }
}

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function parsePullWorldInput(input: PullWorldInput) {
  const parsed = pullWorldInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "Invalid pull request.",
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  return parsed.data;
}
