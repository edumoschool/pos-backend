import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    const rawEndpoint = this.configService.getOrThrow<string>('MINIO_ENDPOINT');
    const endPoint = rawEndpoint.replace(/^https?:\/\//, '');

    this.client = new Minio.Client({
      endPoint,
      port: parseInt(this.configService.getOrThrow<string>('MINIO_PORT'), 10),
      useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: this.configService.getOrThrow<string>('MINIO_SECRET_KEY'),
    });

    this.bucketName = this.configService.getOrThrow<string>('MINIO_BUCKET');
  }

  async onModuleInit() {
    // MinIO may still be starting when this runs, so the first connections can
    // be refused. Retry with a short backoff rather than letting a cold
    // dependency crash the whole app on boot.
    const attempts = 10;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const exists = await this.client.bucketExists(this.bucketName);
        if (!exists) {
          await this.client.makeBucket(this.bucketName);
        }
        return;
      } catch (err) {
        if (attempt === attempts) {
          throw err;
        }
        this.logger.warn(
          `MinIO not ready (attempt ${attempt}/${attempts}), retrying in 3s`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  async uploadImage(
    file: Buffer,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    const objectName = `images/${Date.now()}-${fileName}`;

    await this.client.putObject(
      this.bucketName,
      objectName,
      file,
      file.length,
      { 'Content-Type': contentType },
    );

    return objectName;
  }

  async uploadReport(
    file: Buffer,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    const objectName = `reports/${Date.now()}-${fileName}`;

    await this.client.putObject(
      this.bucketName,
      objectName,
      file,
      file.length,
      { 'Content-Type': contentType },
    );

    return objectName;
  }

  async getFileUrl(objectName: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucketName, objectName, expirySeconds);
  }

  async getImageUrl(objectName: string): Promise<string> {
    return this.client.presignedGetObject(this.bucketName, objectName, 3600);
  }

  async deleteImage(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucketName, objectName);
  }

  async getImage(objectName: string): Promise<Readable> {
    return this.client.getObject(this.bucketName, objectName);
  }
}
