import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client, S3ServiceException, DeleteObjectCommand, } from '@aws-sdk/client-s3';
const DEFAULT_REGION = 'auto';
const DEFAULT_EVIDENCE_PREFIX = 'evidence';
const PLACEHOLDER_VALUES = new Set([
    'your-cloudflare-account-id',
    'your-r2-access-key-id',
    'your-r2-secret-access-key',
    'your-r2-bucket-name',
    'your-r2-endpoint',
]);
const normalizeEnvValue = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');
const hasRealValue = (value) => {
    const normalized = normalizeEnvValue(value).toLowerCase();
    if (!normalized)
        return false;
    if (PLACEHOLDER_VALUES.has(normalized))
        return false;
    if (normalized.startsWith('your-'))
        return false;
    return true;
};
const getR2Config = () => {
    const accountId = normalizeEnvValue(process.env.R2_ACCOUNT_ID);
    const accessKeyId = normalizeEnvValue(process.env.R2_ACCESS_KEY_ID);
    const secretAccessKey = normalizeEnvValue(process.env.R2_SECRET_ACCESS_KEY);
    const bucket = normalizeEnvValue(process.env.R2_BUCKET);
    const endpoint = normalizeEnvValue(process.env.R2_ENDPOINT);
    if (!hasRealValue(accountId) ||
        !hasRealValue(accessKeyId) ||
        !hasRealValue(secretAccessKey) ||
        !hasRealValue(bucket) ||
        !hasRealValue(endpoint)) {
        throw new Error('Cloudflare R2 chua duoc cau hinh day du.');
    }
    return {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        endpoint,
        region: normalizeEnvValue(process.env.R2_REGION) || DEFAULT_REGION,
        evidencePrefix: (normalizeEnvValue(process.env.R2_EVIDENCE_PREFIX) || DEFAULT_EVIDENCE_PREFIX).replace(/^\/+|\/+$/g, ''),
    };
};
export const isR2Configured = () => hasRealValue(process.env.R2_ACCOUNT_ID) &&
    hasRealValue(process.env.R2_ACCESS_KEY_ID) &&
    hasRealValue(process.env.R2_SECRET_ACCESS_KEY) &&
    hasRealValue(process.env.R2_BUCKET) &&
    hasRealValue(process.env.R2_ENDPOINT);
const createR2Client = () => {
    const config = getR2Config();
    return {
        client: new S3Client({
            region: config.region,
            endpoint: config.endpoint,
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
const formatR2Error = (error) => {
    if (error instanceof S3ServiceException) {
        const status = error.$metadata?.httpStatusCode;
        const name = error.name || 'R2Error';
        const message = error.message || 'Unknown error';
        if (status === 401 || status === 403) {
            return `R2 ${status} (${name}): Kiem tra Access Key/Secret, Account ID, Bucket va quyen Object Read/Write. Chi tiet: ${message}`;
        }
        return `R2 ${status || 'ERR'} (${name}): ${message}`;
    }
    if (error instanceof Error)
        return error.message;
    return 'Unknown R2 error';
};
export const buildObjectKey = (fileName) => {
    const { evidencePrefix } = createR2Client();
    return `${evidencePrefix}/${fileName}`.replace(/^\/+/, '');
};
export const uploadBufferToR2 = async ({ buffer, contentType, originalName, objectKey, }) => {
    const { client, bucket, evidencePrefix } = createR2Client();
    const key = objectKey || `${evidencePrefix}/${originalName}`;
    try {
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType || 'application/octet-stream',
        }));
        return key;
    }
    catch (error) {
        throw new Error(`Upload R2 that bai: ${formatR2Error(error)}`);
    }
};
export const getObjectFromR2 = async (key) => {
    const { client, bucket } = createR2Client();
    try {
        const output = await client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
        if (!output.Body)
            return null;
        return {
            body: output.Body,
            contentType: output.ContentType,
            contentLength: typeof output.ContentLength === 'number' ? output.ContentLength : undefined,
            eTag: output.ETag,
            lastModified: output.LastModified,
        };
    }
    catch (error) {
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
        return { ok: true };
    }
    catch (error) {
        return { ok: false, message: formatR2Error(error) };
    }
};
export const deleteObjectFromR2 = async (key) => {
    const { client, bucket } = createR2Client();
    try {
        await client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
        return true;
    }
    catch (error) {
        console.error(`Xoa file tu R2 that bai (Key: ${key}):`, formatR2Error(error));
        return false;
    }
};
//# sourceMappingURL=r2.js.map