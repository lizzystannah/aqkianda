import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { 
  initializeDatabase, 
  getTrafficHistory, 
  incrementVisit, 
  incrementShare, 
  incrementSignup, 
  findDbUserByEmail,
  findDbUserByIdentifier,
  createDbUser,
  updateDbUserProfile,
  getSecurityQuestionForUser,
  resetPasswordWithSecurityAnswer,
  changeDbUserPassword,
  getAllDbUsers,
  updateDbUserStatus,
  getAllDbListings,
  getDbListingById,
  createDbListing,
  updateDbListing,
  deleteDbListing,
  trackDbListingClick,
  getDbMessages,
  createDbMessage,
  getDbReports,
  createDbReport,
  getAllDbBanners,
  createDbBanner,
  deleteDbBanner,
  getAllDbBlogPosts,
  getDbBlogPostBySlugOrId,
  createDbBlogPost,
  updateDbBlogPost,
  deleteDbBlogPost,
  getAdminPassword,
  isAdminEmail,
  verifyPassword,
  upgradePasswordHashIfLegacy,
  getDbFavorites,
  saveDbFavorites,
  getDbRatings,
  saveDbRatings,
  getDbRatingsSummary,
  normalizeEmail,
  isValidEmail
} from "./server/db.js";
import { uploadImageToStorage, testR2Upload, getR2ObjectStream, deleteR2Object } from "./server/r2.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gerar segredo criptográfico aleatório e seguro se JWT_SECRET não estiver configurado
const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️ AVISO DE SEGURANÇA: JWT_SECRET não foi fornecido nas variáveis de ambiente. A gerar segredo criptográfico aleatório seguro (64 bytes).");
    return crypto.randomBytes(64).toString("hex");
  }
  return "aqkianda-dev-secret-key-2026";
})();

if (process.env.NODE_ENV === "production") {
  const configuredJwtSecret = process.env.JWT_SECRET || "";
  if (configuredJwtSecret && configuredJwtSecret.length < 32) {
    console.warn("⚠️ AVISO DE SEGURANÇA: JWT_SECRET deve ter pelo menos 32 caracteres.");
  }
  const configuredAdminPassword = process.env.ADMIN_PASSWORD || process.env.ROOT_PASSWORD || "";
  if (configuredAdminPassword && configuredAdminPassword.length < 12) {
    console.warn("⚠️ AVISO DE SEGURANÇA: ADMIN_PASSWORD/ROOT_PASSWORD deve ter pelo menos 12 caracteres.");
  }
}

export interface JwtUserPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  // Versão de token por utilizador: incrementada a cada troca de palavra-passe.
  // Tokens antigos (sem tv) valem como versão 1 para não expulsar sessões no deploy.
  tv: number;
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

// Versão do token: invalida todas as sessões existentes quando alterada.
// Subir AUTH_TOKEN_VERSION (env) faz logout global imediato, sem depender de datas.
const AUTH_TOKEN_VERSION = process.env.AUTH_TOKEN_VERSION || "1";

const DEFAULT_SECURITY_QUESTION = "Qual é a tua comida tradicional angolana favorita?";

export function generateToken(payload: JwtUserPayload): string {
  return jwt.sign({ ...payload, v: AUTH_TOKEN_VERSION }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtUserPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload & { v?: string };
    // Tokens antigos (sem versão) ou de outra versão são rejeitados
    if (decoded.v !== AUTH_TOKEN_VERSION) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// Validação completa de um JWT: assinatura + versão global + versão por utilizador.
// A versão por utilizador (tv) é incrementada a cada troca de palavra-passe,
// invalidando na hora todos os tokens antigos dessa conta (sessões roubadas incluídas).
async function authenticateRequest(req: express.Request): Promise<JwtUserPayload | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }

  try {
    const user = await findDbUserByEmail(decoded.email);
    const expected = user?.tokenVersion ?? 1;
    const actual = decoded.tv ?? 1;
    if (actual !== expected) {
      return null;
    }
  } catch {
    // BD inacessível de forma inesperada: não bloquear sessão criptograficamente
    // válida (o sistema tolera falhas do MySQL com fallback em memória).
    // findDbUserByEmail já trata os casos normais sem lançar.
  }

  return decoded;
}

// Middleware de Autenticação Obrigatória
export async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão não autenticada. Por favor, inicie sessão." });
  }

  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Sessão expirada ou inválida. Por favor, volte a autenticar-se." });
  }

  req.user = user;
  next();
}

// Middleware de Autenticação Opcional
export function optionalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  authenticateRequest(req)
    .then((user) => {
      if (user) {
        req.user = user;
      }
      next();
    })
    .catch(() => next());
}

// Middleware de Permissões de Administrador
export async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão não autenticada. Por favor, inicie sessão." });
  }

  const user = await authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Sessão expirada ou inválida. Por favor, volte a autenticar-se." });
  }

  req.user = user;
  if (user.role === "admin" || isAdminEmail(user.email)) {
    return next();
  }
  return res.status(403).json({ error: "Acesso restrito a Administradores da Aqkianda." });
}

// Limitadores de taxa (Rate Limiting) para prevenção de ataques de força bruta e abusos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 25, // 25 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Demasiadas tentativas de autenticação. Por favor, aguarde 15 minutos." }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Limite de envio de imagens atingido. Tente novamente mais tarde." }
});

const messagesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  limit: 30, // 30 mensagens por minuto
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Envio de mensagens muito frequente. Por favor, aguarde um momento." }
});

const reportsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: "Limite de envio de denúncias atingido. Tente mais tarde." }
});

const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }
});

// Constrói identificadores de conversa exclusivamente no servidor, com o mesmo
// formato determinístico usado pelo cliente, para que ambos os lados agrupem
// as mensagens na mesma conversa sem confiar em valores enviados pelo cliente.
function sanitizeConversationPart(value: string | undefined): string {
  return (value || "geral")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 40) || "geral";
}

function buildServerConversationId(listingId: string | undefined, emailA: string, emailB: string): string {
  const a = normalizeEmail(emailA);
  const b = normalizeEmail(emailB);
  const lid = sanitizeConversationPart(listingId);
  const sorted = [a, b].sort();
  return `lst_${lid}__${sorted[0]}__${sorted[1]}`.slice(0, 128);
}

function parseConversationId(conversationId: string): { listingId?: string; members: string[] } {
  const raw = (conversationId || "").trim().toLowerCase();
  if (!raw) return { members: [] };

  if (raw.startsWith("lst_")) {
    const parts = raw.slice(4).split("__");
    const listingId = parts[0] || undefined;
    const members = parts.slice(1).map((p) => p.trim()).filter((p) => isValidEmail(p));
    return { listingId, members };
  }

  const members = raw.split("__").map((p) => p.trim()).filter((p) => isValidEmail(p));
  return { members };
}

async function startServer() {
  // Initialize MySQL database connection or fallback gracefully
  await initializeDatabase();

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  const PORT = process.env.PORT || 3000;

  // Limite global reduzido; apenas o upload de imagens autenticado aceita mais.
  const defaultJsonParser = express.json({ limit: "2mb" });
  const uploadJsonParser = express.json({ limit: "8mb" });
  app.use((req, res, next) => {
    if (req.path === "/api/upload" && req.method !== "OPTIONS") {
      // Autentica antes de ler o corpo maior, para que pedidos anónimos não
      // consumam memória com payloads de vários MB.
      return requireAuth(req, res, () => uploadJsonParser(req, res, next));
    }
    return defaultJsonParser(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // Ensure uploads directory exists and serve statically with security headers
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (e) {
      console.error("Error creating uploads dir:", e);
    }
  }
  
  app.use("/uploads", (req, res, next) => {
    // Apenas imagens geradas pelo uploader podem ser servidas publicamente.
    if (!/\.(?:jpe?g|png|webp)$/i.test(req.path)) {
      return res.status(404).end();
    }
    next();
  }, express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
  }));

  // Global security headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // CORS restrito a origens explicitamente configuradas. A aplicação é servida
  // pelo mesmo servidor, pelo que não precisa de wildcard para funcionar.
  const allowedCorsOrigins = new Set<string>();
  const addAllowedOrigin = (raw: string | undefined) => {
    for (const part of (raw || "").split(",")) {
      const value = part.trim();
      if (!value || value === "*") continue;
      try {
        const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        allowedCorsOrigins.add(parsed.origin);
      } catch {
        // Ignora entradas inválidas em vez de abrir CORS por engano.
      }
    }
  };
  addAllowedOrigin(process.env.CORS_ALLOWED_ORIGINS);
  addAllowedOrigin(process.env.APP_URL);
  addAllowedOrigin(process.env.VITE_APP_URL);
  if (process.env.NODE_ENV !== "production") {
    allowedCorsOrigins.add("http://localhost:8080");
    allowedCorsOrigins.add("http://127.0.0.1:8080");
    allowedCorsOrigins.add("http://localhost:3000");
    allowedCorsOrigins.add("http://127.0.0.1:3000");
  }

  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const isAllowed = Boolean(origin && allowedCorsOrigins.has(origin));
    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      return isAllowed || !origin ? res.sendStatus(204) : res.sendStatus(403);
    }
    next();
  });

  // Um host é considerado público quando não é um alias interno do Docker
  // (ex.: "quantterm_aqkianda:80") nem loopback. Aliases internos levam "_"
  // e nunca são acessíveis pelo WhatsApp/Facebook.
  const isPublicHost = (hostname: string): boolean => {
    const host = (hostname || "").toLowerCase();
    if (!host || host.includes("_")) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return true;
    if (host.endsWith(".local")) return false;
    return host.includes(".");
  };

  const normalizeBaseUrl = (raw: string): string | null => {
    const value = (raw || "").trim();
    if (!value) return null;
    const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(withProto);
      if (!isPublicHost(parsed.hostname)) return null;
      return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, "");
    } catch {
      return null;
    }
  };

  // Helper to determine the centralized Base URL on backend
  const getBackendBaseUrl = (req?: express.Request): string => {
    // 1. APP_URL configurado explicitamente. Se apontar para um alias interno
    // do Docker (host com "_"), é ignorado — senão as meta tags OG saem com
    // URLs inalcançáveis e o WhatsApp não gera pré-visualização.
    const configured = normalizeBaseUrl(process.env.APP_URL || process.env.VITE_APP_URL || "");
    if (configured) return configured;

    if (req) {
      // 2. Referer/Origin de pedidos feitos pelo navegador
      const ref = req.headers["referer"] || req.headers["origin"];
      if (ref && typeof ref === "string") {
        const fromRef = normalizeBaseUrl(ref);
        if (fromRef) return fromRef;
      }

      // 3. X-Forwarded-Host / Host do proxy público (Traefik/Easypanel)
      const rawForwardedHost = req.headers["x-forwarded-host"];
      const rawForwardedProto = req.headers["x-forwarded-proto"];
      const proto = Array.isArray(rawForwardedProto)
        ? rawForwardedProto[0]
        : (rawForwardedProto ? rawForwardedProto.split(",")[0].trim() : (req.protocol || "https"));

      const forwardedHost = Array.isArray(rawForwardedHost)
        ? rawForwardedHost[0]
        : (rawForwardedHost ? rawForwardedHost.split(",")[0].trim() : "");
      const hostHeader = req.get("host") || "";

      for (const candidate of [forwardedHost, hostHeader]) {
        const fromHost = normalizeBaseUrl(`${proto}://${candidate}`);
        if (fromHost) return fromHost;
      }
    }

    // 4. Último recurso (ambiente local)
    return `http://localhost:${PORT}`;
  };

  // API Endpoints for backend integration (sem expor URL/base ou estado interno)
  app.get("/api/config", (_req, res) => {
    res.json({
      name: "Aqkianda Marketplace",
      version: "1.0.0"
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Diagnóstico destrutivo (escreve um objeto de teste): apenas administradores.
  app.get("/api/test-r2", requireAdmin, async (_req, res) => {
    const result = await testR2Upload();
    res.status(result.success ? 200 : 500).json({ success: result.success });
  });

  // Serve R2 files directly via backend proxy if public domain is not configured
  app.get(/^\/api\/r2-file\/(.+)$/, async (req, res) => {
    try {
      const paramMap = req.params as unknown as Record<string, string | undefined>;
      const rawKey = paramMap[0] || req.path.replace(/^\/api\/r2-file\//, "");
      let key = "";
      try {
        key = decodeURIComponent(rawKey).trim();
      } catch {
        return res.status(400).send("Chave de ficheiro inválida");
      }

      // Apenas chaves geradas pelo uploader, no formato uploads/<nome>.<ext>.
      const safeKeyPattern = /^uploads\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i;
      if (!key || !safeKeyPattern.test(key)) {
        return res.status(400).send("Chave de ficheiro inválida ou não autorizada");
      }

      const fileData = await getR2ObjectStream(key);
      if (!fileData || !fileData.stream) {
        return res.status(404).send("File not found in R2");
      }

      const contentType = String(fileData.contentType || "");
      if (!/^image\/(?:jpeg|png|webp)$/i.test(contentType)) {
        return res.status(403).send("Tipo de ficheiro não autorizado");
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

      const stream = fileData.stream as unknown as { pipe?: (res: unknown) => void; transformToByteArray?: () => Promise<Uint8Array> };
      if (typeof stream.pipe === "function") {
        stream.pipe(res);
      } else if (typeof stream.transformToByteArray === "function") {
        const bytes = await stream.transformToByteArray();
        res.send(Buffer.from(bytes));
      } else {
        res.send(fileData.stream);
      }
    } catch (error) {
      console.error("Error serving R2 file:", error);
      res.status(500).send("Error fetching R2 file");
    }
  });

  // Dynamic XML Sitemap for SEO and search indexing using centralized APP_URL
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = getBackendBaseUrl(req);
      const items = await getAllDbListings();
      const now = new Date().toISOString().split("T")[0];

      const staticPages = [
        "",
        "/explorar",
        "/publicar",
        "/termos",
        "/entrar",
        "/registar"
      ];

      const categorySlugs = [
        "eletronica", "viaturas", "imoveis", "moda", 
        "moveis", "desporto", "empregos", "servicos"
      ];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

      // Static pages
      for (const page of staticPages) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}${page}</loc>\n`;
        xml += `    <lastmod>${now}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>${page === "" ? "1.0" : "0.8"}</priority>\n`;
        xml += `  </url>\n`;
      }

      // Categories
      for (const cat of categorySlugs) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/explorar?cat=${cat}</loc>\n`;
        xml += `    <lastmod>${now}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }

      // Dynamic listings
      for (const item of items) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/anuncio/${item.id}</loc>\n`;
        xml += `    <lastmod>${now}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.9</priority>\n`;
        xml += `  </url>\n`;
      }

      xml += `</urlset>`;

      res.header("Content-Type", "application/xml; charset=utf-8");
      res.send(xml);
    } catch (e) {
      console.error("Error generating sitemap:", e);
      res.status(500).send("Error generating sitemap");
    }
  });

  // Dynamic robots.txt referencing centralized sitemap URL
  app.get("/robots.txt", (req, res) => {
    const baseUrl = getBackendBaseUrl(req);
    const content = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
    res.header("Content-Type", "text/plain; charset=utf-8");
    res.send(content);
  });

  // Google AdSense ads.txt verification route
  app.get("/ads.txt", (req, res) => {
    const pubId = process.env.VITE_ADSENSE_CLIENT_ID || process.env.ADSENSE_CLIENT_ID || "ca-pub-0000000000000000";
    const content = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
    res.header("Content-Type", "text/plain; charset=utf-8");
    res.send(content);
  });

  // ==========================================================
  // SOCIAL PREVIEWS (Facebook / WhatsApp / Telegram / X)
  // Os crawlers não executam JavaScript: só leem o HTML bruto do
  // servidor. Por isso servimos o index.html com meta tags OG /
  // Twitter absolutas — e em /anuncio/:id com título, preço e foto
  // reais do anúncio quando o visitante é um crawler.
  // Utilizadores normais seguem sempre para o SPA (next()).
  // ==========================================================
  const CRAWLER_RE = /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|pinterestbot|googlebot|bingbot|duckduckbot|baiduspider|yandexbot/i;

  const escapeHtmlAttr = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const toAbsoluteUrl = (maybeRelative: string, baseUrl: string): string => {
    const v = (maybeRelative || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    return `${baseUrl}${v.startsWith("/") ? v : `/${v}`}`;
  };

  const readIndexHtml = (): string | null => {
    const candidates = [
      path.join(process.cwd(), "dist", "index.html"),
      path.join(process.cwd(), "index.html"),
    ];
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8");
      } catch {
        // tenta o próximo candidato
      }
    }
    return null;
  };

  interface SocialMeta {
    title: string;
    description: string;
    image: string;
    url: string;
    type: string;
  }

  const injectSocialMeta = (html: string, meta: SocialMeta): string => {
    let out = html.replace(/<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")\s+content="[^"]*"\s*\/?>/gi, "");
    out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/gi, "");
    const tags = [
      `<meta property="og:site_name" content="Aqkianda" />`,
      `<meta property="og:locale" content="pt_AO" />`,
      `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}" />`,
      `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}" />`,
      `<meta property="og:type" content="${meta.type}" />`,
      `<meta property="og:url" content="${escapeHtmlAttr(meta.url)}" />`,
      meta.image ? `<meta property="og:image" content="${escapeHtmlAttr(meta.image)}" />` : "",
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtmlAttr(meta.description)}" />`,
      meta.image ? `<meta name="twitter:image" content="${escapeHtmlAttr(meta.image)}" />` : "",
      `<link rel="canonical" href="${escapeHtmlAttr(meta.url)}" />`,
    ].filter(Boolean).join("\n    ");
    if (out.includes("</head>")) return out.replace("</head>", `    ${tags}\n  </head>`);
    return `${out}\n${tags}`;
  };

  const DEFAULT_SOCIAL_IMAGE = "/bg-categories.png";
  const DEFAULT_SOCIAL_TITLE = "Aqkianda — Marketplace angolano para comprar e vender";
  const DEFAULT_SOCIAL_DESC = "Aqkianda é o marketplace angolano onde compras e vendes produtos novos e usados: eletrónica, viaturas, moda, casa e mais.";

  // Imagem de preview do site = foto de um dos banners ativos (o primeiro).
  // Cache curto para não consultar o MySQL em cada navegação.
  let bannerImageCache: { raw: string; at: number } | null = null;
  const getBannerSocialImage = async (): Promise<string> => {
    if (bannerImageCache && Date.now() - bannerImageCache.at < 5 * 60 * 1000) {
      return bannerImageCache.raw;
    }
    try {
      const banners = await getAllDbBanners();
      const banner = banners.find((b) => b.isActive !== false && b.image);
      if (banner?.image) {
        bannerImageCache = { raw: banner.image, at: Date.now() };
        return banner.image;
      }
    } catch {
      // usa a imagem de reserva
    }
    return DEFAULT_SOCIAL_IMAGE;
  };

  // Preview dinâmico por anúncio SÓ para crawlers
  const serveListingPreview: express.RequestHandler = async (req, res, next) => {
    try {
      const ua = (req.headers["user-agent"] || "").toString();
      if (!CRAWLER_RE.test(ua)) return next();
      const listing = await getDbListingById(req.params.id);
      if (!listing) return next();
      const template = readIndexHtml();
      if (!template) return next();
      const baseUrl = getBackendBaseUrl(req);
      const price = Number(listing.price) > 0
        ? ` — ${Number(listing.price).toLocaleString("pt-AO")} ${listing.currency || "AOA"}`
        : "";
      const html = injectSocialMeta(template, {
        title: `${listing.title}${price} | Aqkianda`,
        description: (listing.description || "Ver anúncio no Aqkianda.").slice(0, 200),
        image: toAbsoluteUrl(listing.image, baseUrl) || toAbsoluteUrl(await getBannerSocialImage(), baseUrl),
        url: `${baseUrl}/anuncio/${listing.id}`,
        type: "article",
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(html);
    } catch (e) {
      console.error("Erro ao gerar preview social:", e);
      return next();
    }
  };

  app.get("/anuncio/:id", serveListingPreview);
  app.get("/anuncio/:id/:slug", serveListingPreview);

  // Preview por omissão (homepage e restantes páginas) SÓ para crawlers.
  // Sem isto, o express.static / Vite servem o index.html "cru" com
  // og:image relativo e o WhatsApp não consegue gerar o cartão.
  const serveDefaultPreview: express.RequestHandler = async (req, res, next) => {
    const ua = (req.headers["user-agent"] || "").toString();
    if (!CRAWLER_RE.test(ua)) return next();
    const template = readIndexHtml();
    if (!template) return next();
    const baseUrl = getBackendBaseUrl(req);
    const html = injectSocialMeta(template, {
      title: DEFAULT_SOCIAL_TITLE,
      description: DEFAULT_SOCIAL_DESC,
      image: toAbsoluteUrl(await getBannerSocialImage(), baseUrl),
      url: `${baseUrl}${req.path}`,
      type: "website",
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(html);
  };

  app.get("/", serveDefaultPreview);


  // ==========================================================
  // REAL LISTINGS API (ANÚNCIOS CENTRALIZADOS NO MYSQL)
  // ==========================================================
  app.get("/api/listings", async (req, res) => {
    try {
      const items = await getAllDbListings();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Erro ao obter anúncios" });
    }
  });

  app.get("/api/listings/:id", async (req, res) => {
    try {
      const item = await getDbListingById(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Anúncio não encontrado" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Erro ao obter anúncio" });
    }
  });

  app.post("/api/listings", requireAuth, async (req, res) => {
    try {
      const data = req.body;
      if (!data.title || !data.categoryId) {
        return res.status(400).json({ error: "Título e categoria são obrigatórios" });
      }

      // Guarantee ownership is bound strictly to the authenticated user account
      const currentUser = req.user!;
      data.sellerEmail = currentUser.email;
      data.seller = currentUser.name || data.seller || "Vendedor Aqkianda";
      data.sellerId = currentUser.id;

      const created = await createDbListing(data);
      res.status(201).json({ success: true, listing: created });
    } catch (error) {
      console.error("Erro ao criar anúncio:", error);
      res.status(500).json({ error: "Não foi possível criar o anúncio. Tente novamente." });
    }
  });

  app.put("/api/listings/:id", requireAuth, async (req, res) => {
    try {
      const listingId = req.params.id;
      const existingListing = await getDbListingById(listingId);
      if (!existingListing) {
        return res.status(404).json({ error: "Anúncio não encontrado" });
      }

      const currentUser = req.user!;
      const isAuthorized = 
        currentUser.role === "admin" || 
        isAdminEmail(currentUser.email) ||
        (existingListing.sellerEmail && existingListing.sellerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
        (existingListing.seller && existingListing.seller.toLowerCase() === currentUser.name.toLowerCase());

      if (!isAuthorized) {
        return res.status(403).json({ error: "Não autorizado a modificar este anúncio." });
      }

      const success = await updateDbListing(listingId, req.body);
      res.json({ success });
    } catch (error) {
      console.error("Erro ao atualizar anúncio:", error);
      res.status(500).json({ error: "Não foi possível atualizar o anúncio." });
    }
  });

  app.delete("/api/listings/:id", requireAuth, async (req, res) => {
    try {
      const listingId = req.params.id;
      const listing = await getDbListingById(listingId);
      if (!listing) {
        return res.status(404).json({ error: "Anúncio não encontrado" });
      }

      const currentUser = req.user!;
      const isAuthorized = 
        currentUser.role === "admin" || 
        isAdminEmail(currentUser.email) ||
        (listing.sellerEmail && listing.sellerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
        (listing.seller && listing.seller.toLowerCase() === currentUser.name.toLowerCase());

      if (!isAuthorized) {
        return res.status(403).json({ error: "Não autorizado a remover este anúncio." });
      }

      // Fetch images that must be removed from Cloudflare R2
      const imagesToDelete: string[] = [];
      if (listing.image) imagesToDelete.push(listing.image);
      if (listing.images && Array.isArray(listing.images)) {
        imagesToDelete.push(...listing.images);
      } else if (listing.images && typeof listing.images === "string") {
        try {
          const parsed = JSON.parse(listing.images);
          if (Array.isArray(parsed)) imagesToDelete.push(...parsed);
        } catch (_) {
          // Not a JSON string
        }
      }

      for (const imgUrl of imagesToDelete) {
        await deleteR2Object(imgUrl, uploadsDir);
      }

      const success = await deleteDbListing(listingId);
      res.json({ success });
    } catch (error) {
      console.error("Erro ao remover anúncio:", error);
      res.status(500).json({ error: "Não foi possível remover o anúncio." });
    }
  });

  // Explicit storage deletion endpoint for single or multiple files (Protected & Authorized)
  app.post("/api/storage/delete", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user!;
      const isAdmin = currentUser.role === "admin" || isAdminEmail(currentUser.email);
      const { url, urls } = req.body;
      const targets: string[] = urls && Array.isArray(urls) ? urls : url ? [url] : [];
      
      if (targets.length === 0) {
        return res.status(400).json({ error: "Nenhum ficheiro especificado para eliminação." });
      }

      // Se não for admin, verificar se os ficheiros pertencem a anúncios do utilizador autenticado
      if (!isAdmin) {
        const userListings = (await getAllDbListings()).filter(l => 
          (l.sellerEmail && l.sellerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
          (l.sellerId && l.sellerId === currentUser.id)
        );
        const authorizedUrls = new Set<string>();
        for (const l of userListings) {
          if (l.image) authorizedUrls.add(l.image);
          if (Array.isArray(l.images)) {
            l.images.forEach(img => authorizedUrls.add(img));
          }
        }

        const unauthorized = targets.some(target => !authorizedUrls.has(target));
        if (unauthorized) {
          return res.status(403).json({ error: "Não autorizado a eliminar ficheiros que não pertencem aos seus anúncios." });
        }
      }

      let deletedCount = 0;
      for (const target of targets) {
        const ok = await deleteR2Object(target, uploadsDir);
        if (ok) deletedCount++;
      }
      res.json({ success: true, count: targets.length, deletedCount });
    } catch (error) {
      console.error("Erro ao eliminar ficheiros:", error);
      res.status(500).json({ error: "Erro ao eliminar ficheiros." });
    }
  });

  app.post("/api/listings/:id/click", async (req, res) => {
    try {
      const { type } = req.body;
      await trackDbListingClick(req.params.id, type || "view");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao registar clique" });
    }
  });

  // ==========================================================
  // REAL IMAGE UPLOADER (CLOUDFLARE R2 PERSISTENCE WITH LOCAL FALLBACK)
  // ==========================================================
  app.post("/api/upload", uploadLimiter, async (req, res) => {
    try {
      const { image, name } = req.body;
      if (typeof image !== "string" || !image) {
        return res.status(400).json({ error: "Nenhuma imagem fornecida" });
      }

      const result = await uploadImageToStorage(image, uploadsDir, name);
      res.json(result);
    } catch (error) {
      console.error("Erro no upload:", error);
      const isSafeMessage = error instanceof Error && (
        error.message.startsWith("Ficheiro inválido") ||
        error.message.startsWith("Formato de imagem") ||
        error.message.startsWith("Imagem demasiado grande")
      );
      const message = isSafeMessage ? (error as Error).message : "Não foi possível processar a imagem.";
      const status = isSafeMessage && message.startsWith("Imagem demasiado grande") ? 413 : 400;
      res.status(status).json({ error: message });
    }
  });

  // ==========================================================
  // REAL CHAT & MESSAGES API (MENSAGENS GRAVADAS NO MYSQL)
  // ==========================================================
  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user!;
      const currentEmail = normalizeEmail(currentUser.email);
      if (!currentEmail) {
        return res.status(401).json({ error: "Sessão inválida." });
      }

      // O parâmetro ?user= nunca é usado como fonte de verdade. Se for enviado,
      // tem de corresponder ao utilizador autenticado.
      const requestedUser = req.query.user != null ? normalizeEmail(String(req.query.user)) : "";
      if (requestedUser && requestedUser !== currentEmail) {
        return res.status(403).json({ error: "Não autorizado a aceder a mensagens de outro utilizador." });
      }

      // A consulta já devolve apenas mensagens em que o utilizador é remetente
      // ou destinatário exato — nunca por correspondência parcial de conversa.
      const msgs = await getDbMessages(currentEmail);
      res.json(msgs);
    } catch (error) {
      res.status(500).json({ error: "Erro ao obter mensagens" });
    }
  });

  app.post("/api/messages", requireAuth, messagesLimiter, async (req, res) => {
    try {
      const currentUser = req.user!;
      const currentEmail = normalizeEmail(currentUser.email);
      if (!currentEmail) {
        return res.status(401).json({ error: "Sessão inválida." });
      }

      const {
        conversationId,
        receiverEmail: receiverEmailFromClient,
        listingId: listingIdFromClient,
        productName,
        content,
        image
      } = req.body;

      if (!content && !image) {
        return res.status(400).json({ error: "Mensagem ou imagem é obrigatória." });
      }

      const parsed = parseConversationId(typeof conversationId === "string" ? conversationId : "");

      // Se a conversa indicada já identifica participantes, o utilizador atual
      // tem de ser um deles. O destinatário é o outro participante.
      if (parsed.members.length > 0 && !parsed.members.includes(currentEmail)) {
        return res.status(403).json({ error: "Não autorizado a enviar mensagens nesta conversa." });
      }
      let receiverEmail = parsed.members.find((email) => email !== currentEmail) || "";

      const listingId = typeof listingIdFromClient === "string" && listingIdFromClient.trim()
        ? listingIdFromClient.trim()
        : parsed.listingId;

      // Sem outro participante na conversa, o vendedor do anúncio é a fonte
      // de verdade para o destinatário.
      if (!receiverEmail && listingId) {
        const listing = await getDbListingById(listingId);
        const sellerEmail = normalizeEmail(listing?.sellerEmail);
        if (sellerEmail && sellerEmail !== currentEmail) {
          receiverEmail = sellerEmail;
        }
      }

      // Último recurso: aceitar o email do cliente apenas se for válido, não for
      // o próprio utilizador e corresponder a uma conta existente.
      if (!receiverEmail) {
        const candidate = normalizeEmail(receiverEmailFromClient);
        if (isValidEmail(candidate) && candidate !== currentEmail) {
          const candidateUser = await findDbUserByEmail(candidate);
          if (candidateUser) {
            receiverEmail = candidate;
          }
        }
      }

      if (!receiverEmail) {
        return res.status(400).json({ error: "Destinatário da mensagem não identificado." });
      }

      // conversationId e receiverEmail são sempre reconstruídos no servidor.
      const finalConversationId = buildServerConversationId(listingId, currentEmail, receiverEmail);

      const created = await createDbMessage({
        conversationId: finalConversationId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderEmail: currentEmail,
        receiverEmail,
        listingId,
        productName,
        content: content || "",
        image,
        isFromBuyer: req.body.isFromBuyer !== false
      });

      res.status(201).json({ success: true, message: created });
    } catch (error) {
      res.status(500).json({ error: "Erro ao enviar mensagem" });
    }
  });

  // ==========================================================
  // REAL SAFETY REPORTS API (DENÚNCIAS GRAVADAS NO MYSQL)
  // ==========================================================
  app.get("/api/reports", requireAdmin, async (req, res) => {
    try {
      const reports = await getDbReports();
      res.json(reports);
    } catch (error) {
      console.error("Erro ao obter denúncias:", error);
      res.status(500).json({ error: "Erro ao carregar denúncias." });
    }
  });

  app.post("/api/reports", reportsLimiter, optionalAuth, async (req, res) => {
    try {
      const { listingId, listingTitle, reporterName, reporterEmail, reason, details } = req.body;
      if (!listingId || !reason) {
        return res.status(400).json({ error: "Identificador do anúncio e motivo são obrigatórios." });
      }

      const created = await createDbReport({
        listingId,
        listingTitle: listingTitle || "Anúncio",
        reporterName: req.user?.name || reporterName || "Utilizador Aqkianda",
        reporterEmail: req.user?.email || reporterEmail || "",
        reason,
        details: details || "",
        status: "Pendente"
      });

      res.status(201).json({ success: true, report: created });
    } catch (error) {
      console.error("Erro ao registar denúncia:", error);
      res.status(500).json({ error: "Erro ao registar denúncia." });
    }
  });

  // ==========================================================
  // REAL TRAFFIC & ANALYTICS API (MYSQL)
  // ==========================================================
  app.get("/api/analytics/traffic", async (req, res) => {
    try {
      const history = await getTrafficHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Erro ao obter tráfego do servidor" });
    }
  });

  app.post("/api/analytics/visit", analyticsLimiter, async (req, res) => {
    try {
      const { isRegistered, source } = req.body;
      const validSources = ["direct", "search", "share", "whatsapp"];
      const finalSource = validSources.includes(source) ? source : "direct";
      await incrementVisit(!!isRegistered, finalSource);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao registar visita" });
    }
  });

  app.post("/api/analytics/share", analyticsLimiter, async (req, res) => {
    try {
      await incrementShare();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao registar partilha" });
    }
  });

  app.post("/api/analytics/signup", analyticsLimiter, async (req, res) => {
    try {
      await incrementSignup();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao registar inscrição" });
    }
  });

  // ==========================================================
  // REAL AUTHENTICATION & USERS API (MYSQL)
  // ==========================================================
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { name, email, phone, password, location, securityQuestion, securityAnswer } = req.body;
      const cleanEmail = normalizeEmail(email);
      if (!name || !cleanEmail) {
        return res.status(400).json({ error: "Nome e email são obrigatórios" });
      }
      if (!isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: "O email indicado não é válido." });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "A palavra-passe deve conter pelo menos 6 caracteres." });
      }
      const existing = await findDbUserByEmail(cleanEmail);
      if (existing) {
        return res.status(409).json({ error: "Já existe uma conta associada a este e-mail" });
      }
      const user = await createDbUser({
        name: name.trim(),
        email: cleanEmail,
        phone,
        password,
        location: location || "Luanda, Angola",
        securityQuestion: securityQuestion || DEFAULT_SECURITY_QUESTION,
        securityAnswer: securityAnswer || ""
      });
      await incrementSignup();

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role || "user",
        name: user.name,
        tv: user.tokenVersion ?? 1
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          location: user.location,
          securityQuestion: user.securityQuestion
        }
      });
    } catch (error) {
      console.error("Erro ao registar utilizador:", error);
      res.status(500).json({ error: "Erro ao processar registo de utilizador." });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { email, identifier, password } = req.body;
      const cleanIdentifier = normalizeEmail(identifier || email);
      if (!cleanIdentifier || !password) {
        return res.status(400).json({ error: "Email/número de telemóvel e palavra-passe são obrigatórios" });
      }

      const user = await findDbUserByIdentifier(cleanIdentifier);
      if (!user) {
        return res.status(401).json({ error: "Credenciais inválidas." });
      }
      if (user.status === "banned" || user.status === "suspended") {
        return res.status(403).json({ error: "Não foi possível iniciar sessão." });
      }

      const envAdminPass = getAdminPassword();
      const isRoot = isAdminEmail(user.email);
      let isValid = false;

      if (isRoot && envAdminPass) {
        isValid = await verifyPassword(password, envAdminPass);
      }

      if (!isValid) {
        isValid = await verifyPassword(password, user.password);
      }

      if (!isValid) {
        return res.status(401).json({ error: "Credenciais inválidas." });
      }

      // Migração silenciosa de password legada para bcrypt hash
      if (user.password && !user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
        await upgradePasswordHashIfLegacy(user.email, password, user.password);
      }

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role || "user",
        name: user.name,
        tv: user.tokenVersion ?? 1
      });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          location: user.location,
          securityQuestion: user.securityQuestion
        }
      });
    } catch (error) {
      console.error("Erro no login:", error);
      res.status(500).json({ error: "Erro ao autenticar utilizador." });
    }
  });

  // Validação de sessão no arranque do cliente (fonte de verdade para role/admin)
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const payload = req.user;
      if (!payload?.email) {
        return res.status(401).json({ error: "Sessão inválida." });
      }

      const user = await findDbUserByEmail(payload.email);
      if (!user || user.status === "banned" || user.status === "suspended") {
        return res.status(401).json({ error: "Sessão inválida." });
      }

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: isAdminEmail(user.email) ? "admin" : user.role || "user",
          avatar: user.avatar,
          location: user.location,
          securityQuestion: user.securityQuestion
        }
      });
    } catch (error) {
      console.error("Erro ao validar sessão:", error);
      res.status(500).json({ error: "Erro ao validar a sessão." });
    }
  });

  // Favoritos sincronizados por conta (em vez de apenas no navegador)
  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Sessão inválida." });

      const listingIds = await getDbFavorites(email);
      res.json({ listingIds });
    } catch (error) {
      console.error("Erro ao carregar favoritos:", error);
      res.status(500).json({ error: "Erro ao carregar favoritos." });
    }
  });

  app.put("/api/favorites", requireAuth, async (req, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Sessão inválida." });

      const listingIds = Array.isArray(req.body?.listingIds) ? req.body.listingIds : [];
      await saveDbFavorites(email, listingIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao guardar favoritos:", error);
      res.status(500).json({ error: "Erro ao guardar favoritos." });
    }
  });

  // Avaliações sincronizadas por conta (em vez de apenas no navegador)
  app.get("/api/ratings", requireAuth, async (req, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Sessão inválida." });

      const ratings = await getDbRatings(email);
      res.json({ ratings });
    } catch (error) {
      console.error("Erro ao carregar avaliações:", error);
      res.status(500).json({ error: "Erro ao carregar avaliações." });
    }
  });

  app.put("/api/ratings", requireAuth, async (req, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.status(401).json({ error: "Sessão inválida." });

      const ratings = req.body?.ratings && typeof req.body.ratings === "object" ? req.body.ratings : {};
      await saveDbRatings(email, ratings);
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao guardar avaliações:", error);
      res.status(500).json({ error: "Erro ao guardar avaliações." });
    }
  });

  // Agregado público de avaliações (médias reais de todos os utilizadores).
  // Sem autenticação: é a mesma informação exibida nos cartões e páginas.
  app.get("/api/ratings/summary", async (req, res) => {
    try {
      const raw = (req.query.ids || "").toString();
      const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
      const summary = await getDbRatingsSummary(ids.length > 0 ? ids : undefined);
      res.json({ summary });
    } catch (error) {
      console.error("Erro ao carregar resumo de avaliações:", error);
      res.status(500).json({ error: "Erro ao carregar avaliações." });
    }
  });

  // Security Question Recovery Endpoints
  app.post("/api/auth/forgot-password/question", authLimiter, async (req, res) => {
    try {
      const { identifier } = req.body;
      const cleanIdentifier = normalizeEmail(identifier);
      if (!cleanIdentifier) {
        return res.status(400).json({ error: "Email ou telefone é obrigatório" });
      }
      const data = await getSecurityQuestionForUser(cleanIdentifier);
      // Resposta uniforme para impedir enumeração de contas: contas inexistentes
      // recebem a mesma pergunta genérica e falham depois na redefinição.
      return res.json({ success: true, question: data?.question || DEFAULT_SECURITY_QUESTION });
    } catch (error) {
      console.error("Erro ao obter pergunta de segurança:", error);
      res.status(500).json({ error: "Erro ao processar pedido de recuperação." });
    }
  });

  app.post("/api/auth/forgot-password/reset", authLimiter, async (req, res) => {
    try {
      const { identifier, answer, newPassword } = req.body;
      const cleanIdentifier = normalizeEmail(identifier);
      if (!cleanIdentifier || !answer || !newPassword) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "A nova palavra-passe deve conter pelo menos 6 caracteres." });
      }
      const success = await resetPasswordWithSecurityAnswer(cleanIdentifier, answer, newPassword);
      if (!success) {
        return res.status(400).json({ error: "Não foi possível redefinir a palavra-passe com os dados fornecidos." });
      }
      return res.json({ success: true, message: "Palavra-passe atualizada com sucesso!" });
    } catch (error) {
      console.error("Erro ao redefinir palavra-passe:", error);
      res.status(500).json({ error: "Erro ao atualizar a palavra-passe." });
    }
  });

  // Alteração de palavra-passe por utilizador autenticado
  app.post("/api/auth/change-password", authLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "A palavra-passe atual e a nova são obrigatórias." });
      }
      const result = await changeDbUserPassword(currentUser.email, currentPassword, newPassword);
      if (!result.ok) {
        const status = result.error === "A palavra-passe atual está incorreta." ? 401 : 400;
        return res.status(status).json({ error: result.error });
      }
      // Novo token com a versão atualizada: este dispositivo continua logado,
      // todos os outros tokens desta conta morrem na hora.
      const freshToken = generateToken({
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        name: currentUser.name,
        tv: result.tokenVersion ?? 1
      });
      return res.json({ success: true, message: "Palavra-passe atualizada com sucesso!", token: freshToken });
    } catch (error) {
      console.error("Erro ao alterar palavra-passe:", error);
      res.status(500).json({ error: "Erro ao atualizar a palavra-passe." });
    }
  });

  // Admin Registered Users Endpoints (Protected backend query)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await getAllDbUsers();
      res.json(users);
    } catch (error) {
      console.error("Erro ao carregar utilizadores admin:", error);
      res.status(500).json({ error: "Erro ao carregar utilizadores." });
    }
  });

  app.post("/api/admin/users/status", requireAdmin, async (req, res) => {
    try {
      const { userId, status } = req.body;
      if (!userId || !status) {
        return res.status(400).json({ error: "ID e status são obrigatórios" });
      }
      const success = await updateDbUserStatus(userId, status);
      res.json({ success });
    } catch (error) {
      console.error("Erro ao atualizar estado de utilizador:", error);
      res.status(500).json({ error: "Erro ao atualizar estado do utilizador." });
    }
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { email, name, phone, location, avatar, securityQuestion, securityAnswer } = req.body;
      
      // Um utilizador comum só pode atualizar o seu próprio perfil
      const targetEmail = (currentUser.role === "admin" && email) ? email : currentUser.email;

      const updated = await updateDbUserProfile(targetEmail, { name, phone, location, avatar, securityQuestion, securityAnswer });
      res.json({ success: updated });
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      res.status(500).json({ error: "Erro ao atualizar perfil." });
    }
  });

  app.get("/api/categories", (req, res) => {
    res.json([
      { slug: "eletronica", name: "Electrónica", icon: "Smartphone" },
      { slug: "viaturas", name: "Viaturas", icon: "Car" },
      { slug: "imoveis", name: "Imóveis", icon: "Home" },
      { slug: "moda", name: "Moda", icon: "Shirt" },
      { slug: "moveis", name: "Móveis", icon: "Sofa" },
      { slug: "desporto", name: "Desporto", icon: "Dumbbell" },
      { slug: "empregos", name: "Empregos", icon: "Briefcase" },
      { slug: "servicos", name: "Serviços", icon: "Wrench" }
    ]);
  });

  // Banners API (Protected administration)
  app.get("/api/banners", async (req, res) => {
    try {
      const banners = await getAllDbBanners();
      res.json(banners);
    } catch (error) {
      console.error("Erro ao carregar banners:", error);
      res.status(500).json({ error: "Erro ao carregar banners." });
    }
  });

  app.post("/api/banners", requireAdmin, async (req, res) => {
    try {
      const banner = await createDbBanner(req.body);
      res.json({ success: true, banner });
    } catch (error) {
      console.error("Erro ao guardar banner:", error);
      res.status(500).json({ error: "Erro ao guardar banner." });
    }
  });

  app.delete("/api/banners/:id", requireAdmin, async (req, res) => {
    try {
      await deleteDbBanner(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao remover banner:", error);
      res.status(500).json({ error: "Erro ao remover banner." });
    }
  });

  // ==========================================================
  // BLOG ARTICLES API (ARTIGOS CENTRALIZADOS NO MYSQL)
  // ==========================================================
  app.get("/api/blog", async (req, res) => {
    try {
      const showAll = req.query.all === "true";
      const posts = await getAllDbBlogPosts(!showAll);
      res.json(posts);
    } catch (error) {
      console.error("Erro ao carregar artigos do blog:", error);
      res.status(500).json({ error: "Erro ao carregar artigos do blog." });
    }
  });

  app.get("/api/blog/:idOrSlug", async (req, res) => {
    try {
      const post = await getDbBlogPostBySlugOrId(req.params.idOrSlug);
      if (!post) {
        return res.status(404).json({ error: "Artigo do blog não encontrado." });
      }
      res.json(post);
    } catch (error) {
      console.error("Erro ao carregar artigo do blog:", error);
      res.status(500).json({ error: "Erro ao carregar artigo do blog." });
    }
  });

  app.post("/api/blog", requireAdmin, async (req, res) => {
    try {
      const created = await createDbBlogPost(req.body);
      res.status(201).json({ success: true, post: created });
    } catch (error) {
      console.error("Erro ao criar artigo do blog:", error);
      res.status(500).json({ error: "Erro ao guardar artigo do blog." });
    }
  });

  app.put("/api/blog/:id", requireAdmin, async (req, res) => {
    try {
      const success = await updateDbBlogPost(req.params.id, req.body);
      res.json({ success });
    } catch (error) {
      console.error("Erro ao atualizar artigo do blog:", error);
      res.status(500).json({ error: "Erro ao atualizar artigo do blog." });
    }
  });

  app.delete("/api/blog/:id", requireAdmin, async (req, res) => {
    try {
      const success = await deleteDbBlogPost(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Erro ao remover artigo do blog:", error);
      res.status(500).json({ error: "Erro ao remover artigo do blog." });
    }
  });

  // Evita que o navegador cacheie o index.html com código antigo em produção
  app.use((req, res, next) => {
    if (req.method === "GET" && !path.extname(req.path)) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // Crawlers em qualquer página interna (dev e produção). Ignora assets/API.
  app.get(/^\/(?!api\/|assets\/|uploads\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    return serveDefaultPreview(req, res, next);
  });

  // Dev mode: Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve static frontend build
    const distPath = path.join(process.cwd(), "dist");
    // index: false -> não servir index.html diretamente em "/", para que o
    // handler abaixo injete as meta tags OG absolutas também nessa rota.
    app.use(express.static(distPath, { index: false }));
    app.get("/{*path}", async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      // Absolutiza as tags sociais com o domínio real (crawlers exigem URLs absolutas)
      try {
        const template = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
        const baseUrl = getBackendBaseUrl(req);
        const html = injectSocialMeta(template, {
          title: DEFAULT_SOCIAL_TITLE,
          description: DEFAULT_SOCIAL_DESC,
          image: toAbsoluteUrl(await getBannerSocialImage(), baseUrl),
          url: `${baseUrl}${req.path}`,
          type: "website",
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      } catch {
        return res.sendFile(path.join(distPath, "index.html"), {
          headers: { "Cache-Control": "no-store" }
        });
      }
    });
  }

  // Handler final de erros: nunca devolve stack traces nem mensagens internas.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    console.error("Erro não tratado:", err);
    const status = typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : 500;
    if (status === 413) {
      return res.status(413).json({ error: "Pedido demasiado grande." });
    }
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: "Pedido inválido." });
    }
    return res.status(500).json({ error: "Erro interno do servidor." });
  });

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Servidor Aqkianda Node.js a rodar na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Erro ao iniciar o servidor Node.js:", err);
});
