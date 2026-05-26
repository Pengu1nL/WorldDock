import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageObjectRecord } from "./storage.repository";

export const STORAGE_SIGNER = Symbol("STORAGE_SIGNER");

export type SignedObjectUrl = {
  url: string;
  method: "GET" | "PUT";
  headers?: Record<string, string>;
  expiresAt: Date;
};

export type StorageSigner = {
  createUploadUrl(object: StorageObjectRecord): Promise<SignedObjectUrl>;
  createDownloadUrl(object: StorageObjectRecord): Promise<SignedObjectUrl>;
  publicUrl(object: StorageObjectRecord): string;
};

const signedUrlTtlSeconds = 900;

export class S3StorageSigner implements StorageSigner {
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  async createUploadUrl(object: StorageObjectRecord) {
    const command = new PutObjectCommand({
      Bucket: object.bucket,
      Key: object.key,
      ContentType: object.mimeType,
    });
    return {
      url: await getSignedUrl(this.client, command, { expiresIn: signedUrlTtlSeconds }),
      method: "PUT" as const,
      headers: { "content-type": object.mimeType },
      expiresAt: new Date(Date.now() + signedUrlTtlSeconds * 1000),
    };
  }

  async createDownloadUrl(object: StorageObjectRecord) {
    const command = new GetObjectCommand({
      Bucket: object.bucket,
      Key: object.key,
    });
    return {
      url: await getSignedUrl(this.client, command, { expiresIn: signedUrlTtlSeconds }),
      method: "GET" as const,
      expiresAt: new Date(Date.now() + signedUrlTtlSeconds * 1000),
    };
  }

  publicUrl(object: StorageObjectRecord) {
    const baseUrl = process.env.S3_PUBLIC_BASE_URL
      ?? `${(process.env.S3_ENDPOINT ?? "").replace(/\/$/, "")}/${object.bucket}`;
    return `${baseUrl.replace(/\/$/, "")}/${object.key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
