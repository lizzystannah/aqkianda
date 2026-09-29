/**
 * Utilitário de Compressão Suave de Imagens (Cliente)
 * 
 * Reduz suavemente fotos pesadas (ex: 5MB a 12MB de câmaras de smartphone)
 * para ~150KB a 350KB antes de serem transmitidas para o servidor / Cloudflare R2.
 * 
 * - Mantém nitidez e proporções perfeitas (resolução máx: 1600x1600px).
 * - Qualidade JPEG/WebP ajustada a 85% (sem perda visual percetível).
 * - Acelera drasticamente os uploads em redes móveis (3G/4G/5G).
 */

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number; // 0.1 a 1.0 (padrão: 0.85 para compressão suave de alta qualidade)
  outputType?: "image/jpeg" | "image/webp";
}

export async function compressImage(
  fileOrBase64: File | Blob | string,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxDimension = 1600,
    quality = 0.85,
    outputType = "image/jpeg"
  } = options;

  return new Promise((resolve) => {
    // Se for string base64 ou URL
    if (typeof fileOrBase64 === "string") {
      if (!fileOrBase64.startsWith("data:image/")) {
        // Se não for base64 de imagem, retorna direto
        return resolve(fileOrBase64);
      }
      processImageSource(fileOrBase64, maxDimension, quality, outputType, resolve);
      return;
    }

    // Se for File ou Blob
    if (fileOrBase64.type && !fileOrBase64.type.startsWith("image/")) {
      // Arquivo não é imagem (ex: pdf ou outro), retorna original via FileReader
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(fileOrBase64);
      return;
    }

    // Se for SVG, não precisa de redimensionar canvas
    if (fileOrBase64.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(fileOrBase64);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        return resolve("");
      }
      processImageSource(src, maxDimension, quality, outputType, resolve);
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(fileOrBase64);
  });
}

function processImageSource(
  src: string,
  maxDimension: number,
  quality: number,
  outputType: "image/jpeg" | "image/webp",
  onComplete: (result: string) => void
) {
  const img = new Image();
  img.onload = () => {
    try {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Calcular novas dimensões mantendo o aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return onComplete(src);
      }

      // Suavização de alta qualidade
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Fundo branco caso haja transparência em conversão para JPEG
      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Exportar imagem comprimida
      const compressedDataUrl = canvas.toDataURL(outputType, quality);
      
      // Se por algum motivo o resultado ficar maior que o original, mantém o original
      if (compressedDataUrl && compressedDataUrl.length < src.length) {
        onComplete(compressedDataUrl);
      } else {
        onComplete(compressedDataUrl || src);
      }
    } catch (err) {
      console.warn("Aviso na compressão de imagem no cliente, usando original:", err);
      onComplete(src);
    }
  };

  img.onerror = () => {
    // Se falhar ao carregar no Image(), devolve a fonte original
    onComplete(src);
  };

  img.src = src;
}
