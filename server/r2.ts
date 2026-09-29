import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import fs from "fs";

/**
 * CONFIGURAÇÃO ORGANIZADA DO CLOUDFLARE R2
 */
export function getR2Config() {
  const accessKey = (process.env.R2_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || "").trim();
  const secretKey = (process.env.R2_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || "").trim();
  const endpoint = (process.env.R2_ENDPOINT || process.env.S3_ENDPOINT || process.env.ENDPOINT || "").trim();
  const bucket = (process.env.R2_BUCKET_NAME || process.env.BUCKET_NAME || process.env.R2_BUCKET || "").trim();
  const publicDomain = (process.env.R2_PUBLIC_DOMAIN || process.env.PUBLIC_DOMAIN || "").trim().replace(/\/+$/, "");

  return { accessKey, secretKey, endpoint, bucket, publicDomain };
}

export function isR2Configured(): boolean {
  const { accessKey, secretKey, endpoint, bucket } = getR2Config();
  return Boolean(accessKey && secretKey && endpoint && bucket);
}

let s3ClientInstance: S3Client | null = null;
let cachedEndpoint = "";

function getS3Client(): S3Client | null {
  if (!isR2Configured()) return null;
  const { accessKey, secretKey, endpoint } = getR2Config();

  if (!s3ClientInstance || cachedEndpoint !== endpoint) {
    cachedEndpoint = endpoint;
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
 * Obtém o fluxo/stream de um objeto do Cloudflare R2 usando autenticação S3.
 * Utilizado pelo servidor para servir imagens quando R2_PUBLIC_DOMAIN não estiver ativado.
 */
export async function getR2ObjectStream(key: string) {
  const s3 = getS3Client();
  const config = getR2Config();
  if (!s3 || !config.bucket) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });
    const response = await s3.send(command);
    return {
      stream: response.Body,
      contentType: response.ContentType || "image/jpeg",
    };
  } catch (err) {
    console.error(`❌ Erro ao obter objeto R2 '${key}':`, err);
    return null;
  }
}

/**
 * Envia uma imagem para o Cloudflare R2 ou reverte para armazenamento local em disco.
 */
export async function uploadImageToStorage(
  imageInput: string,
  uploadsDir: string,
  preferredFilename?: string
): Promise<UploadResult> {
  // Se já for uma URL pública mantida (HTTP/HTTPS) ou caminho relativo
  if (imageInput.startsWith("http://") || imageInput.startsWith("https://") || imageInput.startsWith("/uploads/")) {
    return { url: imageInput, storage: imageInput.startsWith("http") ? "r2" : "local", success: true };
  }

  // Processar dados Base64 da imagem
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
  const s3 = getS3Client();

  if (s3 && config.bucket) {
    try {
      const key = `uploads/${filename}`;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await s3.send(command);

      // Gerar URL pública permanente
      let publicUrl = "";
      if (config.publicDomain) {
        publicUrl = `${config.publicDomain}/${key}`;
      } else {
        // Se R2_PUBLIC_DOMAIN não estiver definido, usa o proxy do servidor Express
        publicUrl = `/api/r2-file/${key}`;
      }

      console.log(`☁️ Imagem enviada com sucesso para Cloudflare R2: ${publicUrl}`);
      return { url: publicUrl, storage: "r2", success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ Erro no upload para Cloudflare R2, a reverter para disco local:", errMsg);
    }
  } else {
    console.warn("⚠️ Cloudflare R2 não totalmente configurado. Requisitos no .env: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME");
  }

  // Armazenamento local de reserva (Fallback)
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return { url: `/uploads/${filename}`, storage: "local", success: true };
}

/**
 * Rota de Diagnóstico em Tempo Real (/api/test-r2)
 */
export async function testR2Upload(): Promise<{ success: boolean; message: string; details: Record<string, string> }> {
  const config = getR2Config();
  const details = {
    R2_ACCESS_KEY_ID: config.accessKey ? `Definido (${config.accessKey.length} caracteres)` : "❌ Faltando",
    R2_SECRET_ACCESS_KEY: config.secretKey ? `Definido (${config.secretKey.length} caracteres)` : "❌ Faltando",
    R2_ENDPOINT: config.endpoint ? config.endpoint : "❌ Faltando",
    R2_BUCKET_NAME: config.bucket ? config.bucket : "❌ Faltando",
    R2_PUBLIC_DOMAIN: config.publicDomain ? config.publicDomain : "(Desativado - a usar proxy interno /api/r2-file/)"
  };

  if (!config.accessKey) {
    return {
      success: false,
      message: "Falta a variável R2_ACCESS_KEY_ID no .env (o Access Key ID de 32 caracteres do ecrã do R2).",
      details
    };
  }

  if (!config.secretKey) {
    return {
      success: false,
      message: "Falta a variável R2_SECRET_ACCESS_KEY no .env (o Secret Access Key de 64 caracteres do ecrã do R2).",
      details
    };
  }

  if (!config.endpoint) {
    return {
      success: false,
      message: "Falta a variável R2_ENDPOINT no .env (o URL fornecido no ecrã do R2: https://<ACCOUNT_ID>.r2.cloudflarestorage.com).",
      details
    };
  }

  if (!config.bucket) {
    return {
      success: false,
      message: "Falta a variável R2_BUCKET_NAME no .env (o nome do Bucket que criaste no Cloudflare R2).",
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
      : `/api/r2-file/${testKey}`;

    return {
      success: true,
      message: `🎉 Conexão ao Cloudflare R2 efetuada com SUCESSO! Ficheiro de teste gravado no R2: ${publicUrl}`,
      details
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `❌ Erro na comunicação com a API do Cloudflare R2: ${errMsg}`,
      details
    };
  }
}
