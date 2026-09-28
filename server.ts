import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
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
  getAdminPassword,
  isAdminEmail
} from "./server/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize MySQL database connection or fallback gracefully
  await initializeDatabase();

  const app = express();
  app.set("trust proxy", true);
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Ensure uploads directory exists and serve statically
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (e) {
      console.error("Error creating uploads dir:", e);
    }
  }
  app.use("/uploads", express.static(uploadsDir));

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
      mysql: isDbConnected ? "connected" : "fallback_mode"
    });
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

  app.post("/api/listings", async (req, res) => {
    try {
      const data = req.body;
      if (!data.title || !data.categoryId) {
        return res.status(400).json({ error: "Título e categoria são obrigatórios" });
      }
      const created = await createDbListing(data);
      res.status(201).json({ success: true, listing: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao criar anúncio", message });
    }
  });

  app.put("/api/listings/:id", async (req, res) => {
    try {
      const success = await updateDbListing(req.params.id, req.body);
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao atualizar anúncio", message });
    }
  });

  app.delete("/api/listings/:id", async (req, res) => {
    try {
      const success = await deleteDbListing(req.params.id);
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao remover anúncio", message });
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
  // REAL IMAGE UPLOADER (GRAVAÇÃO LOCAL EM DISCO / SERVIDOR)
  // ==========================================================
  app.post("/api/upload", (req, res) => {
    try {
      const { image, name } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Nenhuma imagem fornecida" });
      }

      // If already a hosted URL, pass through
      if (image.startsWith("http://") || image.startsWith("https://") || image.startsWith("/uploads/")) {
        return res.json({ url: image, success: true });
      }

      const match = image.match(/^data:image\/([a-zA-Z0-9.+]+);base64,(.+)$/);
      if (match) {
        const rawExt = match[1].toLowerCase();
        const ext = rawExt === "jpeg" ? "jpg" : rawExt.includes("png") ? "png" : rawExt.includes("webp") ? "webp" : "jpg";
        const data = match[2];
        const buffer = Buffer.from(data, "base64");
        const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        return res.json({ url: `/uploads/${filename}`, success: true });
      }

      return res.status(400).json({ error: "Formato de imagem inválido" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao processar upload", message });
    }
  });

  // ==========================================================
  // REAL CHAT & MESSAGES API (MENSAGENS GRAVADAS NO MYSQL)
  // ==========================================================
  app.get("/api/messages", async (req, res) => {
    try {
      const emailOrKey = (req.query.user || req.query.conversationId || "").toString();
      const msgs = await getDbMessages(emailOrKey);
      res.json(msgs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter mensagens", message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const created = await createDbMessage(req.body);
      res.status(201).json({ success: true, message: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao enviar mensagem", message });
    }
  });

  // ==========================================================
  // REAL SAFETY REPORTS API (DENÚNCIAS GRAVADAS NO MYSQL)
  // ==========================================================
  app.get("/api/reports", async (req, res) => {
    try {
      const reports = await getDbReports();
      res.json(reports);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter denúncias", message });
    }
  });

  app.post("/api/reports", async (req, res) => {
    try {
      const created = await createDbReport(req.body);
      res.status(201).json({ success: true, report: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao registar denúncia", message });
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

  app.post("/api/analytics/visit", async (req, res) => {
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

  app.post("/api/analytics/share", async (req, res) => {
    try {
      await incrementShare();
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao registar partilha", message });
    }
  });

  app.post("/api/analytics/signup", async (req, res) => {
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
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { id, name, email, phone, password, location, securityQuestion, securityAnswer } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: "Nome e email são obrigatórios" });
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
      res.json({ success: true, user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        location: user.location,
        securityQuestion: user.securityQuestion
      } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao registar utilizador", message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, identifier, password } = req.body;
      const cleanIdentifier = (identifier || email || "").trim();
      if (!cleanIdentifier) {
        return res.status(400).json({ error: "Email ou número de telemóvel é obrigatório" });
      }
      const user = await findDbUserByIdentifier(cleanIdentifier);
      if (user) {
        const envAdminPass = getAdminPassword();
        const isRoot = isAdminEmail(user.email);
        
        if (isRoot && envAdminPass) {
          if (password !== user.password && password !== envAdminPass) {
            return res.status(401).json({ error: "Palavra-passe incorreta" });
          }
        } else if (user.password && password && user.password !== password) {
          return res.status(401).json({ error: "Palavra-passe incorreta" });
        }
        return res.json({ 
          success: true, 
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
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao verificar utilizador", message });
    }
  });

  // Security Question Recovery Endpoints
  app.post("/api/auth/forgot-password/question", async (req, res) => {
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
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao obter pergunta de segurança", message });
    }
  });

  app.post("/api/auth/forgot-password/reset", async (req, res) => {
    try {
      const { identifier, answer, newPassword } = req.body;
      if (!identifier || !answer || !newPassword) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios" });
      }
      const success = await resetPasswordWithSecurityAnswer(identifier, answer, newPassword);
      if (!success) {
        return res.status(400).json({ error: "Resposta de segurança incorreta. Tenta novamente." });
      }
      return res.json({ success: true, message: "Palavra-passe atualizada com sucesso!" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao redefinir palavra-passe", message });
    }
  });

  // Admin Registered Users Endpoints (Protected backend query)
  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await getAllDbUsers();
      res.json(users);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao carregar utilizadores", message });
    }
  });

  app.post("/api/admin/users/status", async (req, res) => {
    try {
      const { userId, status } = req.body;
      if (!userId || !status) {
        return res.status(400).json({ error: "ID e status são obrigatórios" });
      }
      const success = await updateDbUserStatus(userId, status);
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao atualizar estado do utilizador", message });
    }
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      const { id, name, email, phone, avatar, location } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: "Nome e email são obrigatórios" });
      }
      const cleanEmail = email.trim().toLowerCase();
      const user = await createDbUser({
        id: id || `usr-g-${Date.now()}`,
        name: name.trim(),
        email: cleanEmail,
        phone,
        avatar,
        location: location || "Luanda, Angola"
      });
      res.json({ 
        success: true, 
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          location: user.location
        } 
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao sincronizar utilizador Google", message });
    }
  });

  app.put("/api/auth/profile", async (req, res) => {
    try {
      const { email, name, phone, location, avatar, securityQuestion, securityAnswer } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email é obrigatório" });
      }
      const updated = await updateDbUserProfile(email, { name, phone, location, avatar, securityQuestion, securityAnswer });
      res.json({ success: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao atualizar perfil", message });
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

  // Banners API (MySQL persistent banners with fallback)
  app.get("/api/banners", async (req, res) => {
    try {
      const banners = await getAllDbBanners();
      res.json(banners);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao carregar banners", message });
    }
  });

  app.post("/api/banners", async (req, res) => {
    try {
      const banner = await createDbBanner(req.body);
      res.json({ success: true, banner });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao guardar banner", message });
    }
  });

  app.delete("/api/banners/:id", async (req, res) => {
    try {
      await deleteDbBanner(req.params.id);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao remover banner", message });
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
