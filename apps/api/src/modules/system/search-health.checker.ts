import { Injectable } from "@nestjs/common";
import type { DependencyHealthChecker } from "./readiness.service";

@Injectable()
export class SearchHealthChecker implements DependencyHealthChecker {
  readonly name = "search";

  async check() {
    const response = await fetch(`${(process.env.MEILISEARCH_HOST ?? "http://localhost:7700").replace(/\/$/, "")}/health`, {
      headers: process.env.MEILISEARCH_API_KEY ? { authorization: `Bearer ${process.env.MEILISEARCH_API_KEY}` } : undefined,
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) {
      throw new Error(`Search health returned ${response.status}.`);
    }
  }
}
