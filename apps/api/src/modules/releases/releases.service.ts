import { Injectable } from "@nestjs/common";
import type { AuthSubject } from "../auth/auth.service";
import { RepositoryService } from "../repositories/repository.service";

@Injectable()
export class ReleasesService {
  constructor(private readonly repositories: RepositoryService) {}

  previewWorldRelease(subject: AuthSubject, worldId: string, input: { releaseNote?: string; license?: string }) {
    return this.repositories.previewWorldRelease(subject, worldId, input);
  }

  rollbackRelease(subject: AuthSubject, releaseId: string) {
    return this.repositories.rollbackRelease(subject, releaseId);
  }

  getForkUpstreamDiff(subject: AuthSubject, forkId: string) {
    return this.repositories.getForkUpstreamDiff(subject, forkId);
  }

  syncFork(subject: AuthSubject, forkId: string) {
    return this.repositories.syncFork(subject, forkId);
  }

  detachFork(subject: AuthSubject, forkId: string) {
    return this.repositories.detachFork(subject, forkId);
  }
}
