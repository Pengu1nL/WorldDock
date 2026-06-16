import { Injectable } from "@nestjs/common";

@Injectable()
export class OfficialAssetLockService {
  private readonly locks = new Map<string, Promise<void>>();

  async withAssetLock<T>(worldId: string, assetId: string, work: () => Promise<T>): Promise<T> {
    const key = `${worldId}:${assetId}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    let releaseCurrentLock: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrentLock = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);
    this.locks.set(key, queued);

    await previous.catch(() => undefined);
    try {
      return await work();
    } finally {
      releaseCurrentLock();
      if (this.locks.get(key) === queued) {
        this.locks.delete(key);
      }
    }
  }
}
