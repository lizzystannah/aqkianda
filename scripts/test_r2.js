import { S3Client, PutObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { getR2Config } from "../server/r2.js";

async function testR2Connection() {
  console.log("=== TESTANDO CONEXÃO CLOUDFLARE R2 ===");
  const config = getR2Config();
  console.log("Configuração encontrada no .env:");
  console.log("  - Secret Key:", config.secretKey ? `${config.secretKey.substring(0, 6)}...` : "(vazio)");
  console.log("  - Access Key:", config.accessKey ? `${config.accessKey.substring(0, 6)}...` : "(vazio)");
  console.log("  - Bucket:", config.bucket || "(vazio)");
  console.log("  - Account ID:", config.accountId || "(vazio)");
  console.log("  - Endpoint:", config.endpoint || "(vazio)");
  console.log("  - Public Domain:", config.publicDomain || "(vazio)");

  if (!config.secretKey) {
    console.error("❌ R2_SECRET_ACCESS_KEY / R2_TOKEN não está definido no .env.");
    return;
  }

  if (!config.endpoint) {
    console.error("\n❌ MOTIVO DA FALHA:");
    console.error("O Cloudflare R2 precisa de saber qual é o teu Account ID para construir o Endpoint S3.");
    console.error("O endpoint do R2 tem a forma: https://<ACCOUNT_ID>.r2.cloudflarestorage.com");
    console.error("Sem o R2_ACCOUNT_ID (ou R2_ENDPOINT), o SDK não sabe para qual servidor Cloudflare enviar os ficheiros.");
    return;
  }

  console.log(`\n🔌 A tentar ligar ao Endpoint: ${config.endpoint}...`);
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  try {
    const testKey = `test_r2_ping_${Date.now()}.txt`;
    console.log(`📤 A tentar carregar ficheiro de teste '${testKey}' no bucket '${config.bucket}'...`);
    
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: testKey,
        Body: Buffer.from("Aqkianda Cloudflare R2 Connection Test"),
        ContentType: "text/plain",
      })
    );

    console.log("✅ SUCESSO! A API do Cloudflare R2 respondeu com sucesso e o ficheiro foi gravado no R2!");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ ERRO NA CHAMADA À API DO R2:", message);
  }
}

testR2Connection();
