import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
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
      environment: process.env.NODE_ENV || "development"
    });
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
    app.get("/*", (req, res) => {
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
