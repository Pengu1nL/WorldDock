import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Injectable } from "@nestjs/common";

type LocalStorageMetadata = {
  contentType?: string;
  sizeBytes: number;
};

@Injectable()
export class LocalStorageService {
  private readonly keyLocks = new Map<string, Promise<void>>();

  async saveObject(input: {
    key: string;
    contentType?: string;
    body: Uint8Array;
  }): Promise<{ key: string; filePath: string; sizeBytes: number }> {
    return this.withKeyLock(input.key, () => this.saveObjectUnlocked(input));
  }

  async readObject(key: string): Promise<{ contentType?: string; body: Uint8Array }> {
    return this.withKeyLock(key, () => this.readObjectUnlocked(key));
  }

  async deleteObject(key: string): Promise<void> {
    await this.withKeyLock(key, async () => {
      const filePath = this.resolveObjectPath(key);
      await Promise.all([
        rm(filePath, { force: true }),
        rm(this.metadataPathForKey(key), { force: true }),
      ]);
    });
  }

  async saveObjectIfCurrentBodyEquals(input: {
    key: string;
    expectedBody: Uint8Array;
    contentType?: string;
    body: Uint8Array;
  }): Promise<boolean> {
    return this.withKeyLock(input.key, async () => {
      const filePath = this.resolveObjectPath(input.key);
      let currentBody: Uint8Array;
      try {
        currentBody = new Uint8Array(await readFile(filePath));
      } catch (error) {
        if (isMissingFileError(error)) return false;
        throw error;
      }
      if (!bytesEqual(currentBody, input.expectedBody)) return false;
      await this.saveObjectUnlocked(input);
      return true;
    });
  }

  private async saveObjectUnlocked(input: {
    key: string;
    contentType?: string;
    body: Uint8Array;
  }): Promise<{ key: string; filePath: string; sizeBytes: number }> {
    const filePath = this.resolveObjectPath(input.key);
    const metadataPath = this.metadataPathForKey(input.key);
    await Promise.all([
      mkdir(dirname(filePath), { recursive: true }),
      mkdir(dirname(metadataPath), { recursive: true }),
    ]);
    await writeFile(filePath, input.body);

    const metadata: LocalStorageMetadata = {
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    return {
      key: input.key,
      filePath,
      sizeBytes: input.body.byteLength,
    };
  }

  private async readObjectUnlocked(key: string): Promise<{ contentType?: string; body: Uint8Array }> {
    const filePath = this.resolveObjectPath(key);
    const [body, metadata] = await Promise.all([
      readFile(filePath),
      this.readMetadata(key),
    ]);

    return {
      contentType: metadata?.contentType,
      body: new Uint8Array(body),
    };
  }

  private async withKeyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.keyLocks.get(key) ?? Promise.resolve();
    let releaseCurrentLock: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrentLock = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);
    this.keyLocks.set(key, queued);

    await previous.catch(() => undefined);
    try {
      return await work();
    } finally {
      releaseCurrentLock();
      if (this.keyLocks.get(key) === queued) {
        this.keyLocks.delete(key);
      }
    }
  }

  private async readMetadata(key: string) {
    try {
      return JSON.parse(await readFile(this.metadataPathForKey(key), "utf8")) as LocalStorageMetadata;
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }

  private resolveObjectPath(key: string) {
    if (!isSafeObjectKey(key)) {
      throw new Error(`Invalid local storage key: ${key}`);
    }

    const basePath = this.resolveDataDir();
    const filePath = resolve(basePath, key);

    if (filePath !== basePath && filePath.startsWith(`${basePath}/`)) {
      return filePath;
    }

    throw new Error(`Invalid local storage key: ${key}`);
  }

  private metadataPathForKey(key: string) {
    if (!isSafeObjectKey(key)) {
      throw new Error(`Invalid local storage key: ${key}`);
    }

    const keyHash = createHash("sha256").update(key).digest("hex");
    return resolve(this.resolveDataDir(), ".metadata", `${keyHash}.json`);
  }

  private resolveDataDir() {
    return resolve(process.env.WORLD_DOCK_DATA_DIR?.trim() || ".worlddock/data");
  }
}

function isSafeObjectKey(key: string) {
  if (!key || key.includes("..") || isAbsolute(key)) return false;
  const segments = key.split("/");
  if (segments[0] === ".metadata") return false;
  return segments.every((segment) => segment.length > 0 && segment !== ".");
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT";
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
