import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { 
  initializeDatabase, 
  getTrafficHistory, 
  incrementVisit, 
  incrementShare, 
  incrementSignup, 
  isDbConnected 
} from "./server/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize MySQL database connection or fallback gracefully
  await initializeDatabase();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

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

  // API Endpoints for backend integration
  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      app: "Aqkianda Marketplace",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      mysql: isDbConnected ? "connected" : "fallback_mode"
    });
  });

  // Real Traffic & Analytics API Endpoints connected to MySQL
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
