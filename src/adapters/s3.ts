import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  NotFound,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

import { Logger } from "./types.js";
import { ServerError } from "../core/index.js";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  defaultBucket?: string;
}

export interface S3UploadOptions {
  bucket?: string;
  key: string;
  body: Buffer | Uint8Array | string | Readable;
  contentType?: string;
  metadata?: Record<string, string>;
  /** Canned ACL e.g. "private" | "public-read" */
  acl?: ObjectCannedACL;
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  url: string;
}

export interface S3ObjectOptions {
  bucket?: string;
  key: string;
}

export interface S3CopyOptions {
  sourceBucket?: string;
  sourceKey: string;
  destinationBucket?: string;
  destinationKey: string;
}

export interface S3SignedUrlOptions {
  bucket?: string;
  key: string;
  expiresIn?: number;
}

// ─── Default Logger ───────────────────────────────────────────────────────────

const defaultLogger: Logger = {
  info: (msg, meta?) => console.info(msg, meta),
  error: (msg, meta?) => console.error(msg, meta),
  warn: (msg, meta?) => console.warn(msg, meta),
  debug: (msg, meta?) => console.debug(msg, meta),
};

// ─── Class ────────────────────────────────────────────────────────────────────

export class S3 {
  private client: S3Client;
  private logger: Logger;
  private defaultBucket?: string;
  private region: string;

  constructor(config: S3Config, logger?: Logger) {
    this.logger = logger ?? defaultLogger;
    this.defaultBucket = config.defaultBucket;
    this.region = config.region;

    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    this.logger.info("S3 client initialized", { region: config.region });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private getBucket(bucket?: string): string {
    const target = bucket ?? this.defaultBucket;
    if (!target) throw new ServerError("S3 bucket not provided");
    return target;
  }

  private getObjectUrl(bucket: string, key: string): string {
    return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  // ─── Upload ──────────────────────────────────────────────────────────────

  /**
   * Uploads a file to S3. Returns the bucket, key, and public URL.
   *
   * @example
   * const result = await s3.upload({ key: "avatars/user-1.png", body: buffer, contentType: "image/png" });
   * result.url // "https://my-bucket.s3.us-east-1.amazonaws.com/avatars/user-1.png"
   */
  async upload({
    bucket,
    key,
    body,
    contentType,
    metadata,
    acl,
  }: S3UploadOptions): Promise<S3UploadResult> {
    const targetBucket = this.getBucket(bucket);

    try {
      const input: PutObjectCommandInput = {
        Bucket: targetBucket,
        Key: key,
        Body: body,
        ...(contentType && { ContentType: contentType }),
        ...(metadata && { Metadata: metadata }),
        ...(acl && { ACL: acl }),
      };

      await this.client.send(new PutObjectCommand(input));
      this.logger.info("S3 upload successful", { bucket: targetBucket, key });

      return {
        bucket: targetBucket,
        key,
        url: this.getObjectUrl(targetBucket, key),
      };
    } catch (err) {
      this.logger.error("S3UploadError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to upload to S3", { cause: err });
    }
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  /**
   * Downloads an S3 object and returns it as a Buffer.
   */
  async download({ bucket, key }: S3ObjectOptions): Promise<Buffer> {
    const targetBucket = this.getBucket(bucket);

    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: targetBucket, Key: key }),
      );

      if (!response.Body) throw new ServerError("Empty S3 response body");

      const buffer = await this.streamToBuffer(response.Body as Readable);
      this.logger.info("S3 download successful", { bucket: targetBucket, key });
      return buffer;
    } catch (err) {
      this.logger.error("S3DownloadError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to download from S3", { cause: err });
    }
  }

  /**
   * Returns the raw readable stream for an S3 object.
   * Prefer this over `download` for large files.
   */
  async stream({ bucket, key }: S3ObjectOptions): Promise<Readable> {
    const targetBucket = this.getBucket(bucket);

    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: targetBucket, Key: key }),
      );

      if (!response.Body) throw new ServerError("Empty S3 response body");
      this.logger.info("S3 stream ready", { bucket: targetBucket, key });
      return response.Body as Readable;
    } catch (err) {
      this.logger.error("S3StreamError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to stream from S3", { cause: err });
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete({ bucket, key }: S3ObjectOptions): Promise<boolean> {
    const targetBucket = this.getBucket(bucket);

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: targetBucket, Key: key }),
      );
      this.logger.info("S3 object deleted", { bucket: targetBucket, key });
      return true;
    } catch (err) {
      this.logger.error("S3DeleteError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to delete S3 object", { cause: err });
    }
  }

  // ─── Copy ─────────────────────────────────────────────────────────────────

  /**
   * Copies an object within S3 — within the same bucket or across buckets.
   *
   * @example
   * await s3.copy({ sourceKey: "uploads/tmp.png", destinationKey: "avatars/user-1.png" });
   */
  async copy({
    sourceBucket,
    sourceKey,
    destinationBucket,
    destinationKey,
  }: S3CopyOptions): Promise<S3UploadResult> {
    const srcBucket = this.getBucket(sourceBucket);
    const dstBucket = this.getBucket(destinationBucket);

    try {
      await this.client.send(
        new CopyObjectCommand({
          CopySource: `${srcBucket}/${sourceKey}`,
          Bucket: dstBucket,
          Key: destinationKey,
        }),
      );

      this.logger.info("S3 object copied", { srcBucket, sourceKey, dstBucket, destinationKey });

      return {
        bucket: dstBucket,
        key: destinationKey,
        url: this.getObjectUrl(dstBucket, destinationKey),
      };
    } catch (err) {
      this.logger.error("S3CopyError", { err, sourceKey, destinationKey });
      throw new ServerError("Failed to copy S3 object", { cause: err });
    }
  }

  // ─── Exists ───────────────────────────────────────────────────────────────

  /**
   * Returns true if the object exists.
   * Throws on non-404 errors (permissions, network) rather than silently returning false.
   */
  async exists({ bucket, key }: S3ObjectOptions): Promise<boolean> {
    const targetBucket = this.getBucket(bucket);

    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: targetBucket, Key: key }),
      );
      return true;
    } catch (err: any) {
      if (err instanceof NotFound || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Re-throw non-404 errors — permissions issues shouldn't silently return false
      this.logger.error("S3ExistsError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to check S3 object existence", { cause: err });
    }
  }

  // ─── Signed URLs ──────────────────────────────────────────────────────────

  /**
   * Generates a pre-signed URL for downloading an object (GET).
   * Default expiry: 1 hour.
   */
  async getSignedDownloadUrl({ bucket, key, expiresIn = 3600 }: S3SignedUrlOptions): Promise<string> {
    const targetBucket = this.getBucket(bucket);

    try {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: targetBucket, Key: key }),
        { expiresIn },
      );
      this.logger.info("S3 signed download URL generated", { bucket: targetBucket, key });
      return url;
    } catch (err) {
      this.logger.error("S3SignedDownloadUrlError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to generate signed download URL", { cause: err });
    }
  }

  /**
   * Generates a pre-signed URL for uploading an object directly (PUT).
   * Use this for browser → S3 direct uploads without proxying through your server.
   *
   * @example
   * const url = await s3.getSignedUploadUrl({ key: "avatars/user-1.png", contentType: "image/png" });
   * // Client does: fetch(url, { method: "PUT", body: file })
   */
  async getSignedUploadUrl({
    bucket,
    key,
    expiresIn = 3600,
    contentType,
  }: S3SignedUrlOptions & { contentType?: string }): Promise<string> {
    const targetBucket = this.getBucket(bucket);

    try {
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: key,
          ...(contentType && { ContentType: contentType }),
        }),
        { expiresIn },
      );
      this.logger.info("S3 signed upload URL generated", { bucket: targetBucket, key });
      return url;
    } catch (err) {
      this.logger.error("S3SignedUploadUrlError", { err, bucket: targetBucket, key });
      throw new ServerError("Failed to generate signed upload URL", { cause: err });
    }
  }

  // ─── Bucket Preset ────────────────────────────────────────────────────────

  /**
   * Returns a scoped helper with the bucket pre-filled.
   *
   * @example
   * const avatars = s3.bucket("my-avatars-bucket");
   * await avatars.upload({ key: "user-1.png", body: buffer });
   */
  bucket(bucketName: string) {
    return {
      upload: (opts: Omit<S3UploadOptions, "bucket">) => this.upload({ ...opts, bucket: bucketName }),
      download: (opts: Omit<S3ObjectOptions, "bucket">) => this.download({ ...opts, bucket: bucketName }),
      stream: (opts: Omit<S3ObjectOptions, "bucket">) => this.stream({ ...opts, bucket: bucketName }),
      delete: (opts: Omit<S3ObjectOptions, "bucket">) => this.delete({ ...opts, bucket: bucketName }),
      exists: (opts: Omit<S3ObjectOptions, "bucket">) => this.exists({ ...opts, bucket: bucketName }),
      copy: (opts: Omit<S3CopyOptions, "destinationBucket">) => this.copy({ ...opts, destinationBucket: bucketName }),
      getSignedDownloadUrl: (opts: Omit<S3SignedUrlOptions, "bucket">) => this.getSignedDownloadUrl({ ...opts, bucket: bucketName }),
      getSignedUploadUrl: (opts: Omit<S3SignedUrlOptions & { contentType?: string }, "bucket">) => this.getSignedUploadUrl({ ...opts, bucket: bucketName }),
    };
  }
}