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
  async saveObject(input: {
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

  async readObject(key: string): Promise<{ contentType?: string; body: Uint8Array }> {
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

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveObjectPath(key);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(this.metadataPathForKey(key), { force: true }),
    ]);
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
