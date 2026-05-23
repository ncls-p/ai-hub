import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
    if (s3Client) return s3Client;

    s3Client = new S3Client({
        endpoint: env.OBJECT_STORAGE_ENDPOINT,
        region: env.OBJECT_STORAGE_REGION,
        credentials: {
            accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
            secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
        },
        forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    });

    return s3Client;
}

export const storage = {
    get bucket(): string {
        return env.OBJECT_STORAGE_BUCKET;
    },

    async upload(
        key: string,
        body: Buffer | Uint8Array | string,
        contentType?: string,
    ): Promise<string> {
        const { PutObjectCommand } = await import("@aws-sdk/client-s3");
        const client = getS3Client();

        await client.send(
            new PutObjectCommand({
                Bucket: env.OBJECT_STORAGE_BUCKET,
                Key: key,
                Body: body,
                ...(contentType && { ContentType: contentType }),
            }),
        );

        return key;
    },

    async download(key: string): Promise<Uint8Array> {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const client = getS3Client();

        const response = await client.send(
            new GetObjectCommand({
                Bucket: env.OBJECT_STORAGE_BUCKET,
                Key: key,
            }),
        );

        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    },

    async delete(key: string): Promise<void> {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const client = getS3Client();

        await client.send(
            new DeleteObjectCommand({
                Bucket: env.OBJECT_STORAGE_BUCKET,
                Key: key,
            }),
        );
    },
};
