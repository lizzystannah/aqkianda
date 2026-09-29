import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import fs from "fs";

// Dynamic Cloudflare R2 Helper Configuration
export function getR2Config() {
  const secretKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_TOKEN || process.env.CLOUDFLARE_R2_SECRET || "";
  const accessKey = process.env.R2_ACCESS_KEY_ID || process.env.R2_KEY_ID || secretKey;
  const bucket = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || process.env.BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET || "";
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "";
  const publicDomain = (process.env.R2_PUBLIC_DOMAIN || process.env.R2_CUSTOM_DOMAIN || "").replace(/\/+$/, "");
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  return { secretKey, accessKey, bucket, accountId, publicDomain, endpoint };
}

export function isR2Configured(): boolean {
  const { secretKey, accessKey, bucket, endpoint } = getR2Config();
  return Boolean(secretKey && accessKey && bucket && endpoint);
}

let s3ClientInstance: S3Client | null = null;
let lastEndpoint = "";

function getS3Client(): S3Client | null {
  if (!isR2Configured()) return null;
  const { secretKey, accessKey, endpoint } = getR2Config();

  if (!s3ClientInstance || lastEndpoint !== endpoint) {
    lastEndpoint = endpoint;
    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }
  return s3ClientInstance;
}

export interface UploadResult {
  url: string;
  storage: "r2" | "local";
  success: boolean;
  message?: string;
}

/**
 * Uploads an image (base64 string or Buffer) to Cloudflare R2.
 * Falls back to local disk storage if R2 is not configured or fails.
 */
export async function uploadImageToStorage(
  imageInput: string,
  uploadsDir: string,
  preferredFilename?: string
): Promise<UploadResult> {
  // If already a hosted URL (HTTP/HTTPS) or relative path, return directly
  if (imageInput.startsWith("http://") || imageInput.startsWith("https://") || imageInput.startsWith("/uploads/")) {
    return { url: imageInput, storage: imageInput.startsWith("http") ? "r2" : "local", success: true };
  }

  // Parse base64 data
  let buffer: Buffer;
  let contentType = "image/jpeg";
  let ext = "jpg";

  const match = imageInput.match(/^data:image\/([a-zA-Z0-9.+]+);base64,(.+)$/);
  if (match) {
    const rawExt = match[1].toLowerCase();
    ext = rawExt === "jpeg" ? "jpg" : rawExt.includes("png") ? "png" : rawExt.includes("webp") ? "webp" : "jpg";
    contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
    buffer = Buffer.from(match[2], "base64");
  } else {
    try {
      buffer = Buffer.from(imageInput, "base64");
    } catch {
      throw new Error("Formato de imagem base64 inválido");
    }
  }

  const filename = preferredFilename || `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const config = getR2Config();

  // Try Cloudflare R2 upload if configured
  const s3 = getS3Client();
  if (s3) {
    try {
      const key = `uploads/${filename}`;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await s3.send(command);

      // Construct public URL
      let publicUrl = "";
      if (config.publicDomain) {
        publicUrl = `${config.publicDomain}/${key}`;
      } else {
        publicUrl = `${config.endpoint}/${config.bucket}/${key}`;
      }

      console.log(`☁️ Imagem enviada com sucesso para Cloudflare R2: ${publicUrl}`);
      return { url: publicUrl, storage: "r2", success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ Erro no upload para Cloudflare R2, a reverter para disco local:", errMsg);
    }
  } else {
    console.warn("⚠️ Cloudflare R2 incompleto no .env. Requisitos: R2_SECRET_ACCESS_KEY, R2_ENDPOINT ou R2_ACCOUNT_ID, e R2_BUCKET_NAME.");
  }

  // Fallback to local disk storage
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return { url: `/uploads/${filename}`, storage: "local", success: true };
}

export async function testR2Upload(): Promise<{ success: boolean; message: string; details: Record<string, string> }> {
  const config = getR2Config();
  const details = {
    hasSecretKey: config.secretKey ? "sim" : "não",
    hasAccessKey: config.accessKey ? "sim" : "não",
    bucket: config.bucket || "não definido no .env (ex: R2_BUCKET_NAME)",
    accountId: config.accountId || "não definido no .env (ex: R2_ACCOUNT_ID)",
    endpoint: config.endpoint || "não definido no .env"
  };

  if (!config.secretKey) {
    return {
      success: false,
      message: "R2_SECRET_ACCESS_KEY / R2_TOKEN não encontrada no .env.",
      details
    };
  }

  if (!config.bucket) {
    return {
      success: false,
      message: "Falta definir o R2_BUCKET_NAME no .env com o nome do teu Bucket no Cloudflare.",
      details
    };
  }

  if (!config.endpoint) {
    return {
      success: false,
      message: "Falta definir o R2_ACCOUNT_ID no .env. O Cloudflare R2 necessita do teu Account ID para saber o endpoint do teu servidor S3 (https://<ACCOUNT_ID>.r2.cloudflarestorage.com).",
      details
    };
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });

    const testKey = `uploads/test_r2_ping_${Date.now()}.txt`;
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: testKey,
        Body: Buffer.from("Aqkianda Cloudflare R2 Connection Test"),
        ContentType: "text/plain",
      })
    );

    const publicUrl = config.publicDomain 
      ? `${config.publicDomain}/${testKey}`
      : `${config.endpoint}/${config.bucket}/${testKey}`;

    return {
      success: true,
      message: `Conexão ao Cloudflare R2 efetuada com SUCESSO! Ficheiro de teste gravado no R2: ${publicUrl}`,
      details
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Erro na chamada de teste ao Cloudflare R2: ${errMsg}`,
      details
    };
  }
}
