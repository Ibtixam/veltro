/**
 * CDN upload — Cloudflare R2 (no egress) preferred, S3 fallback.
 * Mirrors the backend cdn-upload doctrine: ZIP/MP4 to object storage, never attachments.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const provider = process.env.CDN_PROVIDER ?? 'r2';

function client(): S3Client {
  if (provider === 'r2') {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });
}

export async function uploadToCDN(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = provider === 'r2'
    ? (process.env.R2_BUCKET_NAME ?? 'veltro-deliveries')
    : (process.env.S3_BUCKET ?? 'veltro-deliveries');

  await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));

  const publicBase = process.env.CDN_PUBLIC_URL
    ?? (provider === 'r2'
      ? `https://${process.env.R2_BUCKET_NAME}.r2.dev`
      : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`);
  return `${publicBase}/${key}`;
}
