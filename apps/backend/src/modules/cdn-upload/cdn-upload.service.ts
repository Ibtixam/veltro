import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CDNUploadService {
  private readonly logger = new Logger(CDNUploadService.name);

  constructor(private config: ConfigService) {}

  // Upload ZIP buffer → returns CDN link that expires in 7 days
  async uploadZip(buffer: Buffer, domain: string, cycleDate: Date): Promise<{ url: string; expiresAt: Date }> {
    const provider = this.config.get('CDN_PROVIDER', 'r2');  // 'r2' | 's3'
    const key = `veltro-cycles/${domain}/${cycleDate.toISOString().split('T')[0]}-${crypto.randomBytes(6).toString('hex')}.zip`;

    if (provider === 'r2') return this.uploadR2(buffer, key);
    return this.uploadS3(buffer, key);
  }

  // ─── CLOUDFLARE R2 (preferred — no egress fees) ──────────────────────

  private async uploadR2(buffer: Buffer, key: string): Promise<{ url: string; expiresAt: Date }> {
    const accountId  = this.config.get('R2_ACCOUNT_ID', '');
    const bucketName = this.config.get('R2_BUCKET_NAME', 'veltro-deliveries');
    const accessKey  = this.config.get('R2_ACCESS_KEY_ID', '');
    const secretKey  = this.config.get('R2_SECRET_ACCESS_KEY', '');

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const url      = `${endpoint}/${bucketName}/${key}`;
    const now      = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Presigned PUT using AWS Signature V4 (R2 is S3-compatible)
    const presignedUrl = await this.presignS3Put(endpoint, bucketName, key, accessKey, secretKey, 'auto', 7 * 86400);

    const res = await fetch(presignedUrl, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/zip', 'Content-Length': String(buffer.length) },
      body:    buffer,
    });

    if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`);

    // Return presigned GET URL
    const downloadUrl = await this.presignS3Get(endpoint, bucketName, key, accessKey, secretKey, 'auto', 7 * 86400);
    return { url: downloadUrl, expiresAt };
  }

  // ─── AWS S3 ────────────────────────────────────────────────────────

  private async uploadS3(buffer: Buffer, key: string): Promise<{ url: string; expiresAt: Date }> {
    const bucket    = this.config.get('S3_BUCKET', 'veltro-deliveries');
    const region    = this.config.get('S3_REGION', 'us-east-1');
    const accessKey = this.config.get('S3_ACCESS_KEY_ID', '');
    const secretKey = this.config.get('S3_SECRET_ACCESS_KEY', '');
    const endpoint  = `https://s3.${region}.amazonaws.com`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const putUrl = await this.presignS3Put(endpoint, bucket, key, accessKey, secretKey, region, 7 * 86400);
    const res = await fetch(putUrl, {
      method:  'PUT',
      headers: { 'Content-Type':'application/zip' },
      body:    buffer,
    });

    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
    const getUrl = await this.presignS3Get(endpoint, bucket, key, accessKey, secretKey, region, 7 * 86400);
    return { url: getUrl, expiresAt };
  }

  // ─── AWS SIGNATURE V4 PRESIGNED URL ──────────────────────────────────

  private async presignS3Put(endpoint: string, bucket: string, key: string, accessKey: string, secretKey: string, region: string, expirySecs: number): Promise<string> {
    return this.presignS3(endpoint, bucket, key, accessKey, secretKey, region, expirySecs, 'PUT');
  }

  private async presignS3Get(endpoint: string, bucket: string, key: string, accessKey: string, secretKey: string, region: string, expirySecs: number): Promise<string> {
    return this.presignS3(endpoint, bucket, key, accessKey, secretKey, region, expirySecs, 'GET');
  }

  private async presignS3(endpoint: string, bucket: string, key: string, accessKey: string, secretKey: string, region: string, expirySecs: number, method: string): Promise<string> {
    const service = 's3';
    const now     = new Date();
    const date    = now.toISOString().replace(/[-:]/g,'').slice(0,8);
    const datetime = now.toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';
    const scope   = `${date}/${region}/${service}/aws4_request`;

    const params = new URLSearchParams({
      'X-Amz-Algorithm':     'AWS4-HMAC-SHA256',
      'X-Amz-Credential':    `${accessKey}/${scope}`,
      'X-Amz-Date':          datetime,
      'X-Amz-Expires':       String(expirySecs),
      'X-Amz-SignedHeaders': 'host',
    });

    const host        = `${bucket}.${new URL(endpoint).host}`;
    const canonicalUri = `/${key}`;
    const canonicalQS  = params.toString();
    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders    = 'host';
    const payloadHash      = 'UNSIGNED-PAYLOAD';

    const canonical = [method, canonicalUri, canonicalQS, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const strToSign = ['AWS4-HMAC-SHA256', datetime, scope, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');

    const sign = (k: Buffer | string, msg: string) => crypto.createHmac('sha256', k).update(msg).digest();
    const signingKey = sign(sign(sign(sign(`AWS4${secretKey}`, date), region), service), 'aws4_request');
    const sig = sign(signingKey, strToSign).toString('hex');

    params.set('X-Amz-Signature', sig);
    return `${endpoint}/${bucket}/${key}?${params.toString()}`;
  }
}
