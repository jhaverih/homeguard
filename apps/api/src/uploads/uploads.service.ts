import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadsService implements OnModuleInit {
  private s3: S3Client;
  private s3Public: S3Client;
  private bucket: string;
  private readonly logger = new Logger(UploadsService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.bucket = this.configService.get('MINIO_BUCKET_NAME', 'homeguard');
    const port = this.configService.get('MINIO_PORT', '9000');
    const creds = {
      accessKeyId: this.configService.get('MINIO_ROOT_USER', 'minioadmin'),
      secretAccessKey: this.configService.get('MINIO_ROOT_PASSWORD', 'changeme'),
    };

    // Internal client for PUT operations (Docker service name resolves inside the cluster)
    this.s3 = new S3Client({
      endpoint: `http://${this.configService.get('MINIO_ENDPOINT', 'minio')}:${port}`,
      region: 'us-east-1',
      credentials: creds,
      forcePathStyle: true,
    });

    // Public client for signed URL generation — URLs must be reachable by mobile clients
    const publicEndpoint = this.configService.get<string>('MINIO_PUBLIC_ENDPOINT')
      || `http://${this.configService.get('MINIO_ENDPOINT', 'minio')}:${port}`;
    this.s3Public = new S3Client({
      endpoint: publicEndpoint,
      region: 'us-east-1',
      credentials: creds,
      forcePathStyle: true,
    });
  }

  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    const key = `${folder}/${uuidv4()}-${file.originalname}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    return key;
  }

  async getSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3Public, command, { expiresIn: 3600 });
  }
}
