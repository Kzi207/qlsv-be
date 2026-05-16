import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  evidencePrefix: string;
};

type R2ObjectResponse = {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  eTag?: string;
  lastModified?: Date;
};

const DEFAULT_REGION = 'auto';
const DEFAULT_EVIDENCE_PREFIX = 'evidence';
const PLACEHOLDER_VALUES = new Set([
  'your-cloudflare-account-id',
  'your-r2-access-key-id',
  'your-r2-secret-access-key',
  'your-r2-bucket-name',
]);

const normalizeEnvValue = (value?: string) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const hasRealValue = (value?: string) => {
  const normalized = normalizeEnvValue(value).toLowerCase();
  if (!normalized) return false;
  if (PLACEHOLDER_VALUES.has(normalized)) return false;
  if (normalized.startsWith('your-')) return false;
  return true;
};

const getR2Config = (): R2Config => {
  const accountId = normalizeEnvValue(process.env.R2_ACCOUNT_ID);
  const accessKeyId = normalizeEnvValue(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = normalizeEnvValue(process.env.R2_SECRET_ACCESS_KEY);
  const bucket = normalizeEnvValue(process.env.R2_BUCKET);

  if (!hasRealValue(accountId) || !hasRealValue(accessKeyId) || !hasRealValue(secretAccessKey) || !hasRealValue(bucket)) {
    throw new Error('Cloudflare R2 chua duoc cau hinh day du.');
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: normalizeEnvValue(process.env.R2_REGION) || DEFAULT_REGION,
    evidencePrefix: (normalizeEnvValue(process.env.R2_EVIDENCE_PREFIX) || DEFAULT_EVIDENCE_PREFIX).replace(/^\/+|\/+$/g, ''),
  };
};

export const isR2Configured = () =>
  hasRealValue(process.env.R2_ACCOUNT_ID) &&
  hasRealValue(process.env.R2_ACCESS_KEY_ID) &&
  hasRealValue(process.env.R2_SECRET_ACCESS_KEY) &&
  hasRealValue(process.env.R2_BUCKET);

const createR2Client = () => {
  const config = getR2Config();
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;

  return {
    client: new S3Client({
      region: config.region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    bucket: config.bucket,
    evidencePrefix: config.evidencePrefix,
  };
};

const formatR2Error = (error: unknown) => {
  if (error instanceof S3ServiceException) {
    const status = error.$metadata?.httpStatusCode;
    const name = error.name || 'R2Error';
    const message = error.message || 'Unknown error';
    if (status === 401 || status === 403) {
      return `R2 ${status} (${name}): Kiem tra Access Key/Secret, Account ID, Bucket va quyen Object Read/Write. Chi tiet: ${message}`;
    }
    return `R2 ${status || 'ERR'} (${name}): ${message}`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown R2 error';
};

export const buildObjectKey = (fileName: string) => {
  const { evidencePrefix } = createR2Client();
  return `${evidencePrefix}/${fileName}`.replace(/^\/+/, '');
};

export const uploadBufferToR2 = async ({
  buffer,
  contentType,
  originalName,
  objectKey,
}: {
  buffer: Buffer;
  contentType?: string;
  originalName: string;
  objectKey?: string;
}) => {
  const { client, bucket, evidencePrefix } = createR2Client();
  const key = objectKey || `${evidencePrefix}/${originalName}`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      }),
    );
    return key;
  } catch (error) {
    throw new Error(`Upload R2 that bai: ${formatR2Error(error)}`);
  }
};

export const getObjectFromR2 = async (key: string): Promise<R2ObjectResponse | null> => {
  const { client, bucket } = createR2Client();

  try {
    const output = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!output.Body) return null;

    return {
      body: output.Body as Readable,
      contentType: output.ContentType,
      contentLength: typeof output.ContentLength === 'number' ? output.ContentLength : undefined,
      eTag: output.ETag,
      lastModified: output.LastModified,
    };
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw new Error(`Doc file tu R2 that bai: ${formatR2Error(error)}`);
  }
};

export const validateR2Access = async () => {
  const { client, bucket } = createR2Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: formatR2Error(error) };
  }
};
