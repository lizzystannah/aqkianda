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
  isDbConnected,
  findDbUserByEmail,
  findDbUserByIdentifier,
  createDbUser,
  updateDbUserProfile,
  getSecurityQuestionForUser,
  resetPasswordWithSecurityAnswer,
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
  upgradePasswordHashIfLegacy
} from "./server/db.js";
import { uploadImageToStorage, isR2Configured, testR2Upload, getR2ObjectStream, deleteR2Object } from "./server/r2.js";

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

export interface JwtUserPayload {
  id: string;
  email: string;
  role: string;
  name: string;
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

export function generateToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtUserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtUserPayload;
  } catch {
    return null;
  }
}

// Middleware de Autenticação Obrigatória
export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão não autenticada. Por favor, inicie sessão." });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Sessão expirada ou inválida. Por favor, volte a autenticar-se." });
  }

  req.user = decoded;
  next();
}

// Middleware de Autenticação Opcional
export function optionalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
}

// Middleware de Permissões de Administrador
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  requireAuth(req, res, () => {
    const user = req.user;
    if (user && (user.role === "admin" || isAdminEmail(user.email))) {
      return next();
    }
    return res.status(403).json({ error: "Acesso restrito a Administradores da Aqkianda." });
  });
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

async function startServer() {
  // Initialize MySQL database connection or fallback gracefully
  await initializeDatabase();

  const app = express();
  app.set("trust proxy", 1);
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Ensure uploads directory exists and serve statically with security headers
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (e) {
      console.error("Error creating uploads dir:", e);
    }
  }
  
  app.use("/uploads", express.static(uploadsDir, {
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

  // CORS headers for API calls
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Helper to determine the centralized Base URL on backend
  const getBackendBaseUrl = (req?: express.Request): string => {
    let url = process.env.APP_URL || process.env.VITE_APP_URL || "";
    if (url) {
      url = url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }
      return url.replace(/\/+$/, "");
    }
    if (req) {
      // 1. Check referer/origin header if present from browser request
      const ref = req.headers["referer"] || req.headers["origin"];
      if (ref && typeof ref === "string" && !ref.includes("localhost") && !ref.includes("127.0.0.1") && !ref.includes("quantterm_")) {
        try {
          const parsed = new URL(ref);
          return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, "");
        } catch (e) {
          // ignore invalid URL
        }
      }

      // 2. Check X-Forwarded-Host or Host
      const rawForwardedHost = req.headers["x-forwarded-host"];
      const rawForwardedProto = req.headers["x-forwarded-proto"];
      
      const proto = Array.isArray(rawForwardedProto) ? rawForwardedProto[0] : (rawForwardedProto ? rawForwardedProto.split(",")[0].trim() : (req.protocol || "https"));
      
      let host = Array.isArray(rawForwardedHost) ? rawForwardedHost[0] : (rawForwardedHost ? rawForwardedHost.split(",")[0].trim() : (req.headers["host"] || req.get("host") || ""));

      if (host.includes("quantterm_") || host.includes("127.0.0.1") || host.includes("localhost")) {
        const hostHeader = req.get("host") || "";
        if (hostHeader && !hostHeader.includes("quantterm_")) {
          host = hostHeader;
        }
      }

      if (host && !host.includes("quantterm_")) {
        return `${proto}://${host}`.replace(/\/+$/, "");
      }
    }
    return `http://localhost:${PORT}`;
  };

  // API Endpoints for backend integration
  app.get("/api/config", (req, res) => {
    res.json({
      appUrl: getBackendBaseUrl(req),
      name: "Aqkianda Marketplace",
      version: "1.0.0"
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      app: "Aqkianda Marketplace",
      appUrl: getBackendBaseUrl(req),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      mysql: isDbConnected ? "connected" : "fallback_mode",
      r2Storage: isR2Configured() ? "active" : "not_configured"
    });
  });

  app.get("/api/test-r2", async (req, res) => {
    const result = await testR2Upload();
    res.status(result.success ? 200 : 400).json(result);
  });

  // Serve R2 files directly via backend proxy if public domain is not configured
  app.get(/^\/api\/r2-file\/(.+)$/, async (req, res) => {
    try {
      const paramMap = req.params as unknown as Record<string, string | undefined>;
      const rawKey = paramMap[0] || req.path.replace(/^\/api\/r2-file\//, "");
      const key = decodeURIComponent(rawKey).trim();
      if (!key || key.includes("..") || key.startsWith("/") || !key.startsWith("uploads/")) {
        return res.status(400).send("Chave de ficheiro inválida ou não autorizada");
      }

      const fileData = await getR2ObjectStream(key);
      if (!fileData || !fileData.stream) {
        return res.status(404).send("File not found in R2");
      }

      res.setHeader("Content-Type", fileData.contentType);
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
  // REAL LISTINGS API (ANÚNCIOS CENTRALIZADOS NO MYSQL)
  // ==========================================================
  app.get("/api/listings", async (req, res) => {
    try {
      const items = await getAllDbListings();
      res.json(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter anúncios", message });
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
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter anúncio", message });
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
      if (!image) {
        return res.status(400).json({ error: "Nenhuma imagem fornecida" });
      }

      const result = await uploadImageToStorage(image, uploadsDir, name);
      res.json(result);
    } catch (error) {
      console.error("Erro no upload:", error);
      const message = error instanceof Error ? error.message : "Erro ao processar imagem";
      res.status(400).json({ error: message });
    }
  });

  // ==========================================================
  // REAL CHAT & MESSAGES API (MENSAGENS GRAVADAS NO MYSQL)
  // ==========================================================
  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const currentUser = req.user!;
      const emailOrKey = (req.query.user || req.query.conversationId || "").toString().trim().toLowerCase();
      
      const msgs = await getDbMessages(emailOrKey || currentUser.email);
      const isAdmin = currentUser.role === "admin" || isAdminEmail(currentUser.email);
      
      // Proteger contra IDOR: Utilizadores comuns só podem ler as suas próprias mensagens
      const authorizedMsgs = msgs.filter(m => {
        if (isAdmin) return true;
        const sender = (m.senderEmail || "").toLowerCase();
        const receiver = (m.receiverEmail || "").toLowerCase();
        const userEmail = currentUser.email.toLowerCase();
        return sender === userEmail || receiver === userEmail || m.conversationId.toLowerCase().includes(userEmail);
      });

      res.json(authorizedMsgs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter mensagens", message });
    }
  });

  app.post("/api/messages", requireAuth, messagesLimiter, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { conversationId, receiverId, receiverEmail, listingId, productName, content, image } = req.body;

      if (!content && !image) {
        return res.status(400).json({ error: "Mensagem ou imagem é obrigatória." });
      }

      const created = await createDbMessage({
        conversationId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderEmail: currentUser.email,
        receiverId,
        receiverEmail,
        listingId,
        productName,
        content: content || "",
        image,
        isFromBuyer: req.body.isFromBuyer !== false
      });

      res.status(201).json({ success: true, message: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao enviar mensagem", message });
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
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter tráfego do servidor", message });
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
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao registar visita", message });
    }
  });

  app.post("/api/analytics/share", analyticsLimiter, async (req, res) => {
    try {
      await incrementShare();
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao registar partilha", message });
    }
  });

  app.post("/api/analytics/signup", analyticsLimiter, async (req, res) => {
    try {
      await incrementSignup();
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao registar inscrição", message });
    }
  });

  // ==========================================================
  // REAL AUTHENTICATION & USERS API (MYSQL)
  // ==========================================================
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { id, name, email, phone, password, location, securityQuestion, securityAnswer } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: "Nome e email são obrigatórios" });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "A palavra-passe deve conter pelo menos 6 caracteres." });
      }
      const cleanEmail = email.trim().toLowerCase();
      const existing = await findDbUserByEmail(cleanEmail);
      if (existing) {
        return res.status(409).json({ error: "Já existe uma conta associada a este e-mail" });
      }
      const user = await createDbUser({
        id: id || `usr-${Date.now()}`,
        name: name.trim(),
        email: cleanEmail,
        phone,
        password,
        location: location || "Luanda, Angola",
        securityQuestion: securityQuestion || "Qual é a tua comida tradicional angolana favorita?",
        securityAnswer: securityAnswer || ""
      });
      await incrementSignup();

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role || "user",
        name: user.name
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
      const cleanIdentifier = (identifier || email || "").trim();
      if (!cleanIdentifier || !password) {
        return res.status(400).json({ error: "Email/número de telemóvel e palavra-passe são obrigatórios" });
      }
      const user = await findDbUserByIdentifier(cleanIdentifier);
      if (user) {
        if (user.status === "banned" || user.status === "suspended") {
          return res.status(403).json({ error: "Esta conta encontra-se suspensa. Contacte o suporte." });
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
          return res.status(401).json({ error: "Palavra-passe incorreta" });
        }

        // Migração silenciosa de password legada para bcrypt hash
        if (user.password && !user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
          await upgradePasswordHashIfLegacy(user.email, password, user.password);
        }

        const token = generateToken({
          id: user.id,
          email: user.email,
          role: user.role || "user",
          name: user.name
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
      }
      return res.status(404).json({ error: "Utilizador não encontrado" });
    } catch (error) {
      console.error("Erro no login:", error);
      res.status(500).json({ error: "Erro ao autenticar utilizador." });
    }
  });

  // Security Question Recovery Endpoints
  app.post("/api/auth/forgot-password/question", authLimiter, async (req, res) => {
    try {
      const { identifier } = req.body;
      if (!identifier) {
        return res.status(400).json({ error: "Email ou telefone é obrigatório" });
      }
      const data = await getSecurityQuestionForUser(identifier);
      if (!data) {
        return res.status(404).json({ error: "Nenhuma conta encontrada com este email ou telefone." });
      }
      return res.json({ success: true, question: data.question, email: data.email });
    } catch (error) {
      console.error("Erro ao obter pergunta de segurança:", error);
      res.status(500).json({ error: "Erro ao processar pedido de recuperação." });
    }
  });

  app.post("/api/auth/forgot-password/reset", authLimiter, async (req, res) => {
    try {
      const { identifier, answer, newPassword } = req.body;
      if (!identifier || !answer || !newPassword) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "A nova palavra-passe deve conter pelo menos 6 caracteres." });
      }
      const success = await resetPasswordWithSecurityAnswer(identifier, answer, newPassword);
      if (!success) {
        return res.status(400).json({ error: "Resposta de segurança incorreta ou inexistente. Tenta novamente." });
      }
      return res.json({ success: true, message: "Palavra-passe atualizada com sucesso!" });
    } catch (error) {
      console.error("Erro ao redefinir palavra-passe:", error);
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
    app.use(express.static(distPath));
    app.get("/{*path}", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Servidor Aqkianda Node.js a rodar na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Erro ao iniciar o servidor Node.js:", err);
});
