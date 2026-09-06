import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "@vietnam-tax/observability";

export interface ObjectStorageConfig {
  endpoint?: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  forcePathStyle?: boolean;
  localFallbackDir?: string;
}

export interface BuildKeyOptions {
  sourceName: string;
  sourceId: string;
  snapshotId: string;
  filename:
    | "page.html"
    | "metadata.json"
    | "original.pdf"
    | "original.docx"
    | "response.xml"
    | string;
  date?: Date;
}

export class ObjectStorageService {
  private readonly client: S3Client | null = null;
  private readonly bucket: string;
  private readonly localFallbackDir: string | null;

  constructor(config?: Partial<ObjectStorageConfig>) {
    this.bucket =
      config?.bucket ||
      process.env.OBJECT_STORAGE_BUCKET ||
      "vietnam-tax-legal";

    const endpoint =
      config?.endpoint || process.env.OBJECT_STORAGE_ENDPOINT;
    const accessKeyId =
      config?.accessKeyId || process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretAccessKey =
      config?.secretAccessKey || process.env.OBJECT_STORAGE_SECRET_KEY;
    const region =
      config?.region || process.env.OBJECT_STORAGE_REGION || "us-east-1";
    const forcePathStyle =
      config?.forcePathStyle ??
      (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true" || !!endpoint);

    this.localFallbackDir =
      config?.localFallbackDir ||
      process.env.LOCAL_STORAGE_DIR ||
      join(process.cwd(), ".local_storage");

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint,
        region,
        forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      logger.info(
        { endpoint, bucket: this.bucket, forcePathStyle },
        "Object storage client initialized"
      );
    } else {
      logger.warn(
        { localFallbackDir: this.localFallbackDir },
        "S3 credentials not provided. Using local filesystem storage fallback."
      );
    }
  }

  public buildKey(options: BuildKeyOptions): string {
    const d = options.date ?? new Date();
    const year = d.getFullYear().toString();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const sanitizedSource = options.sourceName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");

    return `raw/${sanitizedSource}/${year}/${month}/${options.sourceId}/${options.snapshotId}/${options.filename}`;
  }

  public async ensureBucket(): Promise<void> {
    if (!this.client) {
      if (this.localFallbackDir) {
        await mkdir(this.localFallbackDir, { recursive: true });
      }
      return;
    }

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket })
        );
        logger.info({ bucket: this.bucket }, "Created object storage bucket");
      } catch (createErr) {
        logger.warn(
          { bucket: this.bucket, err: createErr },
          "Could not create bucket (it might already exist or permissions insufficient)"
        );
      }
    }
  }

  public async putObject(
    key: string,
    data: Buffer | string,
    contentType: string = "application/octet-stream"
  ): Promise<string> {
    const bodyBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");

    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bodyBuffer,
          ContentType: contentType,
        })
      );
      return key;
    }

    // Local filesystem fallback
    const targetPath = join(this.localFallbackDir!, key);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bodyBuffer);
    return key;
  }

  public async getObject(key: string): Promise<Buffer> {
    if (this.client) {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!res.Body) {
        throw new Error(`Empty response body for S3 key: ${key}`);
      }

      const stream = res.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    const targetPath = join(this.localFallbackDir!, key);
    return await readFile(targetPath);
  }
}
