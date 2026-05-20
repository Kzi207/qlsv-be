import type { Readable } from 'stream';
type R2ObjectResponse = {
    body: Readable;
    contentType?: string;
    contentLength?: number;
    eTag?: string;
    lastModified?: Date;
};
export declare const isR2Configured: () => boolean;
export declare const buildObjectKey: (fileName: string) => string;
export declare const uploadBufferToR2: ({ buffer, contentType, originalName, objectKey, }: {
    buffer: Buffer;
    contentType?: string;
    originalName: string;
    objectKey?: string;
}) => Promise<string>;
export declare const getObjectFromR2: (key: string) => Promise<R2ObjectResponse | null>;
export declare const validateR2Access: () => Promise<{
    ok: true;
    message?: undefined;
} | {
    ok: false;
    message: string;
}>;
export declare const deleteObjectFromR2: (key: string) => Promise<boolean>;
export {};
//# sourceMappingURL=r2.d.ts.map