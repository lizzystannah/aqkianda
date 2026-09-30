import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hashOrPlain?: string | null): Promise<boolean> {
  if (!password || !hashOrPlain) return false;
  if (hashOrPlain.startsWith("$2a$") || hashOrPlain.startsWith("$2b$") || hashOrPlain.startsWith("$2y$")) {
    try {
      return await bcrypt.compare(password, hashOrPlain);
    } catch {
      return false;
    }
  }
  // Constant-time check for legacy plain-text password upgrade only (timing attack protection)
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(hashOrPlain);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function upgradePasswordHashIfLegacy(email: string, password: string, storedHash?: string | null): Promise<void> {
  if (!storedHash) return;
  if (!storedHash.startsWith("$2a$") && !storedHash.startsWith("$2b$") && !storedHash.startsWith("$2y$")) {
    try {
      const newHash = await hashPassword(password);
      if (isDbConnected && pool) {
        await pool.query("UPDATE users SET password_hash = ? WHERE LOWER(email) = ?", [newHash, email.toLowerCase()]);
      }
    } catch (e) {
      console.error("Erro ao migrar senha legada:", e);
    }
  }
}

const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQL_PORT || "3306");
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? process.env.MYSQL_ROOT_PASSWORD ?? "";
const DB_NAME = (process.env.DB_NAME || process.env.MYSQL_DATABASE || process.env.DATABASE_NAME || "").trim();

export let pool: mysql.Pool | null = null;
export let isDbConnected = false;

// ==============================================================
// TYPES & INTERFACES
// ==============================================================
export interface DailyTrafficRecord {
  date: string; // YYYY-MM-DD
  viewsTotal: number;
  viewsNew: number;
  viewsRegistered: number;
  shares: number;
  signups: number;
  direct: number;
  search: number;
  shareLink: number;
  whatsapp: number;
}

export interface DbUserRecord {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role?: string;
  avatar?: string;
  location?: string;
  securityQuestion?: string;
  securityAnswer?: string;
  status?: string;
  registeredAt?: string;
}

export interface DbListingRecord {
  id: string;
  title: string;
  price: number;
  currency: string;
  condition: "novo" | "usado";
  location: string;
  image: string;
  images?: string[];
  featured: boolean;
  rating: number;
  categoryId: string;
  description: string;
  postedAt: string;
  seller: string;
  phone: string;
  sellerEmail?: string;
  sellerId?: string;
  tags?: string[] | string;
  promoEventId?: string;
  promoDiscount?: number;
  promoPrice?: number;
  status?: string;
  viewsCount?: number;
  clicksCount?: number;
}

export interface DbMessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  receiverId?: string;
  receiverEmail?: string;
  listingId?: string;
  productName?: string;
  content: string;
  image?: string;
  isFromBuyer: boolean;
  createdAt: string;
}

export interface DbReportRecord {
  id: string;
  listingId: string;
  listingTitle?: string;
  reporterName: string;
  reporterEmail?: string;
  reason: string;
  details: string;
  status: "Pendente" | "Resolvido" | "Ignorado" | "Removido";
  createdAt: string;
}

export interface DbBlogPostRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  coverImage: string;
  category: string;
  authorName: string;
  authorAvatar?: string;
  viewsCount?: number;
  isPublished: boolean;
  createdAt: string;
}

/**
 * Returns list of authorized root/admin emails configured via environment variables.
 * Supports comma-separated emails e.g.: ADMIN_EMAIL=root@site.com,admin@site.com
 */
export function getAdminEmails(): string[] {
  const envVal = process.env.ADMIN_EMAIL || process.env.ROOT_EMAIL || process.env.VITE_ADMIN_EMAIL || "admin@aqkianda.com";
  return envVal
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return getAdminEmails().includes(clean);
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || process.env.ROOT_PASSWORD || process.env.VITE_ADMIN_PASSWORD || "";
}

const ADMIN_EMAIL = getAdminEmails()[0] || "admin@aqkianda.com";

// ==============================================================
// SEED DATA GENERATOR
// ==============================================================
export function generateSeedTrafficHistory(): DailyTrafficRecord[] {
  const list: DailyTrafficRecord[] = [];
  const baseDate = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(baseDate.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    
    list.push({
      date: dateStr,
      viewsTotal: 0,
      viewsNew: 0,
      viewsRegistered: 0,
      shares: 0,
      signups: 0,
      direct: 0,
      search: 0,
      shareLink: 0,
      whatsapp: 0,
    });
  }
  return list;
}

export const SEED_LISTINGS: DbListingRecord[] = [
  {
    id: "1",
    title: "iPhone 13 Pro Max 256GB",
    price: 650000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Talatona",
    image: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=800&q=80",
    featured: true,
    rating: 4.8,
    categoryId: "eletronica",
    description: "iPhone 13 Pro Max em excelente estado, com 256GB de memória. Bateria a 100%. Inclui caixa e acessórios originais.",
    postedAt: "Há 2 horas",
    seller: "João Manuel",
    phone: "923 111 222",
    sellerEmail: "joao.manuel@exemplo.ao"
  },
  {
    id: "2",
    title: "Toyota Hilux 2020 4x4",
    price: 18500000,
    currency: "AOA",
    condition: "usado",
    location: "Benguela, Lobito",
    image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80",
    featured: true,
    rating: 4.9,
    categoryId: "viaturas",
    description: "Toyota Hilux 2020, tração 4x4, motor a diesel. Apenas 45.000km rodados. Manutenções sempre em dia na marca.",
    postedAt: "Há 5 horas",
    seller: "Kalandula Motors",
    phone: "912 333 444",
    sellerEmail: "kalandula@motors.ao"
  },
  {
    id: "3",
    title: "Apartamento T3 Kilamba",
    price: 35000000,
    currency: "AOA",
    condition: "usado",
    location: "Luanda, Kilamba",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.5,
    categoryId: "imoveis",
    description: "Apartamento T3 no Kilamba, Bloco W. Cozinha equipada, quartos com roupeiros e sala ampla. Pronto a habitar.",
    postedAt: "Ontem",
    seller: "Imobiliária Futuro",
    phone: "931 555 666",
    sellerEmail: "geral@imobiliariafuturo.ao"
  },
  {
    id: "4",
    title: "Ténis Nike Air Max",
    price: 45000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Maianga",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.7,
    categoryId: "moda",
    description: "Ténis Nike Air Max novos, nunca usados. Disponíveis em vários tamanhos. Entrega imediata em Luanda.",
    postedAt: "Há 1 dia",
    seller: "Fashion Store",
    phone: "945 777 888",
    sellerEmail: "vendas@fashionstore.ao"
  },
  {
    id: "5",
    title: "Sofá L em Couro Sintético",
    price: 380000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Viana",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
    featured: true,
    rating: 4.6,
    categoryId: "moveis",
    description: "Sofá em L de couro sintético, cor cinza escuro. 3 lugares + chaise longue. Almofadas incluídas. Entrega ao domicílio em Luanda.",
    postedAt: "Há 3 horas",
    seller: "MóveisPlus",
    phone: "928 999 000",
    sellerEmail: "atendimento@moveisplus.ao"
  },
  {
    id: "6",
    title: "Bicicleta de Montanha Shimano",
    price: 120000,
    currency: "AOA",
    condition: "usado",
    location: "Huambo, Cidade",
    image: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.3,
    categoryId: "desporto",
    description: "Bicicleta de montanha com câmbio Shimano 21 velocidades. Quadro em alumínio, pneus novos. Ideal para trilhos e cidade.",
    postedAt: "Há 6 horas",
    seller: "Pedro Esportes",
    phone: "991 222 333",
    sellerEmail: "pedro@esportes.ao"
  },
  {
    id: "7",
    title: "Vaga: Programador Full-Stack",
    price: 0,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Ingombota",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 5.0,
    categoryId: "empregos",
    description: "Empresa de tecnologia em Luanda procura programador full-stack com experiência em React e Node.js. Regime híbrido, salário competitivo.",
    postedAt: "Hoje",
    seller: "TechAngola",
    phone: "922 444 555",
    sellerEmail: "rh@techangola.ao"
  },
  {
    id: "8",
    title: "Electricista Certificado 24h",
    price: 15000,
    currency: "AOA",
    condition: "novo",
    location: "Luanda, Cacuaco",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
    featured: false,
    rating: 4.9,
    categoryId: "servicos",
    description: "Serviço de electricista certificado, disponível 24 horas. Instalações, reparações e manutenções. Orçamento gratuito.",
    postedAt: "Há 4 horas",
    seller: "ElectroServiços",
    phone: "933 666 777",
    sellerEmail: "contacto@electroservicos.ao"
  }
];

export const SEED_BLOG_POSTS: DbBlogPostRecord[] = [
  {
    id: "blog-1",
    slug: "guia-de-compras-e-vendas-seguras-em-luanda",
    title: "Guia Definitivo para Comprar e Vender em Segurança em Luanda",
    summary: "Aprenda as melhores dicas para negociar presencialmente, verificar produtos e evitar problemas comuns em plataformas de compra e venda online em Angola.",
    content: `
      <h2>Negociar com Confiança e Segurança no Aqkianda</h2>
      <p>O comércio eletrónico em Angola cresce a um ritmo acelerado. Comprar e vender artigos em segunda mão é uma excelente forma de economizar dinheiro e dar uma nova vida a objetos que já não utiliza. No entanto, é fundamental adotar medidas de segurança simples para proteger o seu dinheiro e integridade pessoal.</p>
      
      <h3>1. Marque Encontros Apenas em Locais Públicos e Movimentados</h3>
      <p>Nunca aceite encontrar-se com um comprador ou vendedor em locais isolados ou no interior de residências particulares de desconhecidos. Prefira pontos de referência seguros em Luanda, como:</p>
      <ul>
        <li>Centros comerciais (ex: Belas Shopping, Shopping Avennida, Kero Talatona)</li>
        <li>Postos de combustível conhecidos com movimento de pessoas</li>
        <li>Agências bancárias ou esquadras policiais próximas</li>
      </ul>

      <h3>2. Inspecione o Artigo com Atenção Antes de Pagar</h3>
      <p>Quando comprar telemóveis, computadores ou eletrónica, teste o dispositivo no momento do encontro. Verifique o estado da bateria, as câmeras, a ligação Wi-Fi e se o aparelho não tem bloqueios de conta ou palavras-passe ativas.</p>

      <h3>3. Cuidado com Sinais de Pagamento Antecipado</h3>
      <p>Desconfie de vendedores que exijam "sinal" ou transferência antecipada via Multicaixa Express antes de mostrar o produto pessoalmente. No Aqkianda, encorajamos que a transação ocorra no momento em que recebe e verifica o artigo.</p>

      <h3>4. Guarde as Conversas dentro da Plataforma</h3>
      <p>Utilize o sistema de mensagens integrado do Aqkianda para manter o registo das suas negociações. Assim, em caso de dúvida ou necessidade de suporte, a nossa equipa poderá auxiliar rapidamente.</p>
    `,
    coverImage: "https://images.unsplash.com/photo-1556742049-0a67dd3a921d?auto=format&fit=crop&w=1200&q=80",
    category: "Dicas de Segurança",
    authorName: "Equipa Aqkianda",
    authorAvatar: "AQ",
    viewsCount: 0,
    isPublished: true,
    createdAt: "2026-09-15 10:00:00"
  },
  {
    id: "blog-2",
    slug: "como-fotografar-produtos-para-vender-mais-rapido",
    title: "Como Fotografar os seus Produtos para Vender 3x Mais Rápido",
    summary: "Descubra como uma boa iluminação, ângulos corretos e detalhes limpos podem transformar o seu anúncio e atrair compradores em poucos minutos.",
    content: `
      <h2>A Primeira Impressão do Seu Anúncio Começa na Foto</h2>
      <p>Estudos do mercado de e-commerce mostram que anúncios com fotos claras e bem iluminadas recebem até 3 vezes mais contactos do que anúncios com fotos escuras ou desfocadas.</p>

      <h3>1. Use Iluminação Natural</h3>
      <p>Não precisa de um estúdio profissional! A melhor luz é a luz natural do dia. Posicione o seu artigo perto de uma janela ou na varanda, evitando a luz direta do sol forte que cria sombras indesejadas.</p>

      <h3>2. Fundo Limpo e Neutro</h3>
      <p>Coloque o objeto sobre uma mesa limpa, um lençol branco ou um fundo de cor sólida. Evite distrações ao fundo que retirem a atenção do produto principal.</p>

      <h3>3. Fotografe Vários Ângulos e Detalhes</h3>
      <p>Mostre a parte frontal, traseira, de perfil e eventuais marcas de uso ou acessórios incluídos (caixa, carregador, fones). A transparência gera confiança imediata no comprador!</p>
    `,
    coverImage: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=80",
    category: "Guias de Venda",
    authorName: "Equipa Aqkianda",
    authorAvatar: "AQ",
    viewsCount: 0,
    isPublished: true,
    createdAt: "2026-09-20 14:30:00"
  },
  {
    id: "blog-3",
    slug: "tendencias-de-tecnologia-e-smartphones-em-angola-2026",
    title: "Tendências de Tecnologia e Eletrónica em Angola em 2026",
    summary: "Análise dos modelos de smartphones, laptops e gadgets mais procurados no mercado angolano neste trimestre.",
    content: `
      <h2>O Mercado de Eletrónica em Expansão</h2>
      <p>O mercado de dispositivos móveis em Angola continua em constante evolução. Cada vez mais utilizadores procuram telemóveis de alta performance para trabalho, criação de conteúdo e entretenimento.</p>
      
      <h3>Smartphones Mais Procurados em Luanda</h3>
      <p>Modelos da série iPhone Pro Max e Samsung Galaxy S mantêm a liderança em termos de valor de revenda. No entanto, marcas como Xiaomi e Tecno têm ganhado enorme destaque pelo excelente custo-benefício em gamas médias.</p>

      <h3>Dica para Vendedores de Tecnologia</h3>
      <p>Mantenha sempre os acessórios originais, caixas e faturas de compra, se disponível. Anúncios de tecnologia com histórico comprovado vendem significativamente mais rápido no Aqkianda!</p>
    `,
    coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
    category: "Notícias & Tendências",
    authorName: "Equipa Aqkianda",
    authorAvatar: "AQ",
    viewsCount: 0,
    isPublished: true,
    createdAt: "2026-09-25 09:15:00"
  }
];

// In-memory fallback stores
let inMemoryTraffic: DailyTrafficRecord[] = [];
const inMemoryBlogPosts: DbBlogPostRecord[] = [...SEED_BLOG_POSTS];
const inMemoryUsers: DbUserRecord[] = [
  {
    id: "usr-admin-1",
    name: "Administrador Aqkianda",
    email: ADMIN_EMAIL,
    password: getAdminPassword() || undefined,
    role: "admin",
    phone: "",
    avatar: "AQ",
    location: "Luanda, Angola"
  }
];
const inMemoryListings: DbListingRecord[] = [...SEED_LISTINGS];
const inMemoryMessages: DbMessageRecord[] = [];
const inMemoryReports: DbReportRecord[] = [];

// ==============================================================
// RESILIENT POOL & AUTO-RECONNECT MANAGEMENT
// ==============================================================
let isReconnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

export function createMySQLPool(): mysql.Pool {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    maxIdle: 10,
    idleTimeout: 60000,
  });
}

export function handleDbError(err: unknown, context: string = "query") {
  const errMsg = err instanceof Error ? err.message : String(err);
  const isConnError = 
    errMsg.includes("PROTOCOL_CONNECTION_LOST") ||
    errMsg.includes("ECONNRESET") ||
    errMsg.includes("ECONNREFUSED") ||
    errMsg.includes("ETIMEDOUT") ||
    errMsg.includes("EPIPE") ||
    errMsg.includes("Can't connect to MySQL server") ||
    errMsg.includes("closed") ||
    errMsg.includes("ER_NET_READ_INTERRUPTED") ||
    errMsg.includes("Connection lost") ||
    errMsg.includes("PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR");

  if (isConnError) {
    console.warn(`⚠️ Perda de conexão MySQL detectada durante '${context}': ${errMsg}. A agendar reconexão automática...`);
    isDbConnected = false;
    scheduleReconnect(2000);
  } else {
    console.error(`Erro na operação MySQL ('${context}'):`, errMsg);
  }
}

export function scheduleReconnect(delayMs: number = 3000) {
  if (!DB_NAME || isReconnecting) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    await reconnectDatabase();
  }, delayMs);
}

export async function reconnectDatabase(): Promise<boolean> {
  if (!DB_NAME || isReconnecting) return false;
  isReconnecting = true;
  console.log(`🔄 A tentar restabelecer conexão com o MySQL '${DB_NAME}' (${DB_HOST}:${DB_PORT})...`);

  try {
    if (pool) {
      try {
        await pool.end();
      } catch {
        // Ignora erro ao fechar pool anterior
      }
      pool = null;
    }

    pool = createMySQLPool();
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();

    isDbConnected = true;
    console.log("✅ Conexão com o MySQL restaurada e ativa com sucesso!");
    return true;
  } catch (err) {
    isDbConnected = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ Tentativa de reconexão ao MySQL falhou: ${msg}. Nova tentativa automática em 10s...`);
    scheduleReconnect(10000);
    return false;
  } finally {
    isReconnecting = false;
  }
}

export function startDatabaseHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!DB_NAME) return;

    if (isDbConnected && pool) {
      try {
        await pool.query("SELECT 1 as ping");
      } catch (err) {
        handleDbError(err, "heartbeat ping");
      }
    } else if (!isDbConnected && !isReconnecting) {
      // Tenta reconectar periodicamente
      scheduleReconnect(3000);
    }
  }, 15000);
}

// ==============================================================
// DATABASE INITIALIZATION
// ==============================================================
export async function initializeDatabase() {
  if (!DB_NAME) {
    console.warn("⚠️ Nenhuma base de dados definida na variável de ambiente DB_NAME (ou MYSQL_DATABASE).");
    console.warn("ℹ️ Para conectar ao MySQL, define o nome da tua base de dados no ficheiro .env (ex: DB_NAME=o_teu_banco).");
    console.warn("⚠️ A utilizar modo de simulação em memória.");
    inMemoryTraffic = generateSeedTrafficHistory();
    isDbConnected = false;
    return;
  }

  try {
    console.log(`🔌 A tentar ligar à base de dados MySQL '${DB_NAME}' em ${DB_HOST}:${DB_PORT}...`);

    try {
      const initConn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        connectTimeout: 5000
      });
      await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await initConn.end();
      console.log(`📦 Base de dados '${DB_NAME}' verificada com sucesso.`);
    } catch {
      // Ignorar se o utilizador não tiver privilégios globais de CREATE DATABASE
    }

    pool = createMySQLPool();

    const conn = await pool.getConnection();
    console.log("✅ Conectado com sucesso ao MySQL!");
    conn.release();
    isDbConnected = true;
    startDatabaseHeartbeat();

    // 1. Tabela de Utilizadores
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(150) NOT NULL,
        \`email\` VARCHAR(191) NOT NULL UNIQUE,
        \`password_hash\` VARCHAR(255) DEFAULT NULL,
        \`phone\` VARCHAR(50) DEFAULT NULL,
        \`role\` ENUM('user', 'seller', 'admin') NOT NULL DEFAULT 'user',
        \`avatar\` VARCHAR(255) DEFAULT NULL,
        \`location\` VARCHAR(100) DEFAULT 'Luanda, Angola',
        \`security_question\` VARCHAR(255) DEFAULT NULL,
        \`security_answer\` VARCHAR(255) DEFAULT NULL,
        \`status\` ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_users_email\` (\`email\`),
        INDEX \`idx_users_role\` (\`role\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure columns exist if table was previously created
    try {
      await pool.query("ALTER TABLE `users` ADD COLUMN `security_question` VARCHAR(255) DEFAULT NULL");
    } catch {
      // Column already exists
    }
    try {
      await pool.query("ALTER TABLE `users` ADD COLUMN `security_answer` VARCHAR(255) DEFAULT NULL");
    } catch {
      // Column already exists
    }

    // 2. Tabela de Categorias
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`categories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`slug\` VARCHAR(64) NOT NULL UNIQUE,
        \`name\` VARCHAR(100) NOT NULL,
        \`icon\` VARCHAR(50) NOT NULL DEFAULT 'Package',
        \`description\` TEXT DEFAULT NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        INDEX \`idx_categories_slug\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Tabela de Anúncios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`listings\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`title\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`price\` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        \`currency\` VARCHAR(10) NOT NULL DEFAULT 'AOA',
        \`condition_type\` ENUM('novo', 'usado') NOT NULL DEFAULT 'usado',
        \`location\` VARCHAR(150) NOT NULL DEFAULT 'Luanda, Angola',
        \`category_id\` VARCHAR(64) NOT NULL,
        \`seller_id\` VARCHAR(64) DEFAULT NULL,
        \`seller_name\` VARCHAR(150) NOT NULL,
        \`seller_email\` VARCHAR(191) DEFAULT NULL,
        \`seller_phone\` VARCHAR(50) DEFAULT NULL,
        \`image_url\` LONGTEXT NOT NULL,
        \`tags\` TEXT DEFAULT NULL,
        \`is_pinned\` TINYINT(1) NOT NULL DEFAULT 0,
        \`is_featured\` TINYINT(1) NOT NULL DEFAULT 0,
        \`rating\` DECIMAL(3,2) NOT NULL DEFAULT 5.00,
        \`promo_event_id\` VARCHAR(64) DEFAULT NULL,
        \`promo_discount\` INT DEFAULT 0,
        \`promo_price\` DECIMAL(15,2) DEFAULT NULL,
        \`views_count\` INT NOT NULL DEFAULT 0,
        \`clicks_count\` INT NOT NULL DEFAULT 0,
        \`status\` ENUM('active', 'sold', 'paused', 'deleted') NOT NULL DEFAULT 'active',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_listings_category\` (\`category_id\`),
        INDEX \`idx_listings_seller_email\` (\`seller_email\`),
        INDEX \`idx_listings_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query("ALTER TABLE `listings` ADD COLUMN `tags` TEXT DEFAULT NULL");
    } catch {
      // Column already exists
    }

    // 4. Tabela de Mensagens do Chat
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`messages\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`conversation_id\` VARCHAR(128) NOT NULL,
        \`sender_id\` VARCHAR(64) DEFAULT NULL,
        \`sender_name\` VARCHAR(150) NOT NULL,
        \`sender_email\` VARCHAR(191) NOT NULL,
        \`receiver_id\` VARCHAR(64) DEFAULT NULL,
        \`receiver_email\` VARCHAR(191) DEFAULT NULL,
        \`listing_id\` VARCHAR(64) DEFAULT NULL,
        \`product_name\` VARCHAR(255) DEFAULT NULL,
        \`content\` TEXT NOT NULL,
        \`image_url\` LONGTEXT DEFAULT NULL,
        \`is_from_buyer\` TINYINT(1) NOT NULL DEFAULT 1,
        \`is_read\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_messages_conversation\` (\`conversation_id\`),
        INDEX \`idx_messages_sender\` (\`sender_email\`),
        INDEX \`idx_messages_receiver\` (\`receiver_email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Tabela de Denúncias
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`reports\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`listing_id\` VARCHAR(64) NOT NULL,
        \`listing_title\` VARCHAR(255) DEFAULT NULL,
        \`reporter_name\` VARCHAR(150) DEFAULT 'Anónimo',
        \`reporter_email\` VARCHAR(191) DEFAULT NULL,
        \`reason\` VARCHAR(150) NOT NULL,
        \`details\` TEXT NOT NULL,
        \`status\` ENUM('Pendente', 'Resolvido', 'Ignorado', 'Removido') NOT NULL DEFAULT 'Pendente',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_reports_listing\` (\`listing_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Tabela de Analytics de Tráfego
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`platform_traffic_analytics\` (
        \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
        \`traffic_date\` DATE NOT NULL UNIQUE,
        \`views_total\` INT NOT NULL DEFAULT 0,
        \`views_new\` INT NOT NULL DEFAULT 0,
        \`views_registered\` INT NOT NULL DEFAULT 0,
        \`shares_count\` INT NOT NULL DEFAULT 0,
        \`signups_count\` INT NOT NULL DEFAULT 0,
        \`ref_direct\` INT NOT NULL DEFAULT 0,
        \`ref_search\` INT NOT NULL DEFAULT 0,
        \`ref_share_link\` INT NOT NULL DEFAULT 0,
        \`ref_whatsapp\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Tabela do Blog de Artigos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`blog_posts\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`slug\` VARCHAR(191) NOT NULL UNIQUE,
        \`title\` VARCHAR(255) NOT NULL,
        \`summary\` TEXT NOT NULL,
        \`content\` LONGTEXT NOT NULL,
        \`cover_image\` LONGTEXT NOT NULL,
        \`category\` VARCHAR(100) NOT NULL DEFAULT 'Geral',
        \`author_name\` VARCHAR(150) NOT NULL DEFAULT 'Equipa Aqkianda',
        \`author_avatar\` VARCHAR(255) DEFAULT NULL,
        \`views_count\` INT NOT NULL DEFAULT 0,
        \`is_published\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_blog_slug\` (\`slug\`),
        INDEX \`idx_blog_published\` (\`is_published\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabela de Favoritos (sincronizados por conta)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`favorites\` (
        \`user_email\` VARCHAR(191) NOT NULL,
        \`listing_id\` VARCHAR(64) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`user_email\`, \`listing_id\`),
        INDEX \`idx_favorites_user\` (\`user_email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabela de Avaliações (sincronizadas por conta)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`ratings\` (
        \`user_email\` VARCHAR(191) NOT NULL,
        \`listing_id\` VARCHAR(64) NOT NULL,
        \`rating\` TINYINT NOT NULL DEFAULT 5,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`user_email\`, \`listing_id\`),
        INDEX \`idx_ratings_listing\` (\`listing_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed blog posts if empty
    const [blogRows] = (await pool.query("SELECT COUNT(*) as count FROM `blog_posts`")) as [mysql.RowDataPacket[], unknown];
    if (blogRows && blogRows[0] && blogRows[0].count === 0) {
      console.log("🌱 Tabela do blog vazia. A semear artigos iniciais...");
      for (const article of SEED_BLOG_POSTS) {
        await pool.query(`
          INSERT INTO \`blog_posts\`
          (\`id\`, \`slug\`, \`title\`, \`summary\`, \`content\`, \`cover_image\`, \`category\`, \`author_name\`, \`author_avatar\`, \`views_count\`, \`is_published\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          article.id,
          article.slug,
          article.title,
          article.summary,
          article.content,
          article.coverImage,
          article.category,
          article.authorName,
          article.authorAvatar || 'AQ',
          article.viewsCount || 100
        ]);
      }
      console.log("🌱 Artigos iniciais do blog semeados com sucesso no MySQL!");
    }

    // 7. Seed initial listings if table is empty
    const [listingRows] = (await pool.query("SELECT COUNT(*) as count FROM `listings`")) as [mysql.RowDataPacket[], unknown];
    if (listingRows && listingRows[0] && listingRows[0].count === 0) {
      console.log("🌱 Tabela de anúncios vazia. A semear catálogo inicial...");
      for (const item of SEED_LISTINGS) {
        await pool.query(`
          INSERT INTO \`listings\` 
          (\`id\`, \`title\`, \`description\`, \`price\`, \`currency\`, \`condition_type\`, \`location\`, \`category_id\`, \`seller_name\`, \`seller_phone\`, \`seller_email\`, \`image_url\`, \`is_featured\`, \`rating\`, \`status\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
          item.id,
          item.title,
          item.description,
          item.price,
          item.currency,
          item.condition,
          item.location,
          item.categoryId,
          item.seller,
          item.phone,
          item.sellerEmail || null,
          item.image,
          item.featured ? 1 : 0,
          item.rating || 5.0
        ]);
      }
      console.log("🌱 Catálogo inicial de anúncios semeado com sucesso no MySQL!");
    }

    // 8. Seed initial traffic analytics if empty
    const [rows] = (await pool.query("SELECT COUNT(*) as count FROM `platform_traffic_analytics`")) as [mysql.RowDataPacket[], unknown];
    if (rows && rows[0] && rows[0].count === 0) {
      console.log("🌱 A semear dados de tráfego dos últimos 30 dias no MySQL...");
      const seeds = generateSeedTrafficHistory();
      for (const s of seeds) {
        await pool.query(`
          INSERT INTO \`platform_traffic_analytics\` 
          (\`traffic_date\`, \`views_total\`, \`views_new\`, \`views_registered\`, \`shares_count\`, \`signups_count\`, \`ref_direct\`, \`ref_search\`, \`ref_share_link\`, \`ref_whatsapp\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          s.date, s.viewsTotal, s.viewsNew, s.viewsRegistered, s.shares, s.signups, s.direct, s.search, s.shareLink, s.whatsapp
        ]);
      }
    }

    // 9. Sync configured Root / Admin user from environment variables
    const adminEmails = getAdminEmails();
    const envAdminPass = getAdminPassword();
    const primaryAdminEmail = adminEmails[0] || "admin@aqkianda.com";

    try {
      if (envAdminPass) {
        const hashedAdminPass = (envAdminPass.startsWith("$2a$") || envAdminPass.startsWith("$2b$"))
          ? envAdminPass
          : await hashPassword(envAdminPass);
        await pool.query(`
          INSERT INTO \`users\` (\`id\`, \`name\`, \`email\`, \`password_hash\`, \`role\`, \`location\`)
          VALUES ('usr-admin-1', 'Administrador Aqkianda', ?, ?, 'admin', 'Luanda, Angola')
          ON DUPLICATE KEY UPDATE 
            \`email\` = VALUES(\`email\`),
            \`password_hash\` = VALUES(\`password_hash\`),
            \`role\` = 'admin';
        `, [primaryAdminEmail, hashedAdminPass]);
      } else {
        await pool.query(`
          INSERT INTO \`users\` (\`id\`, \`name\`, \`email\`, \`role\`, \`location\`)
          VALUES ('usr-admin-1', 'Administrador Aqkianda', ?, 'admin', 'Luanda, Angola')
          ON DUPLICATE KEY UPDATE 
            \`email\` = VALUES(\`email\`),
            \`role\` = 'admin';
        `, [primaryAdminEmail]);
      }
      console.log("🔐 Utilizador Root/Admin verificado e sincronizado no MySQL.");
    } catch (adminErr) {
      console.error("Error syncing root admin user in MySQL:", adminErr);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("❌ Falha na conexão ou inicialização do MySQL:", message || error);

    if (message.includes("Access denied") && message.includes("to database")) {
      console.error("\n=======================================================");
      console.error("💡 DIAGNÓSTICO DE ACESSO AO MYSQL:");
      console.error(`O utilizador '${DB_USER}' não tem permissões para aceder à base de dados '${DB_NAME}'.`);
      console.error("Para resolver este problema rapidamente:");
      console.error(`  docker exec -it quantterm_mysql mysql -u root -p`);
      console.error(`  CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
      console.error(`  GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';`);
      console.error("  FLUSH PRIVILEGES;");
      console.error("=======================================================\n");
    }

    console.warn("⚠️ A reverter temporariamente para o modo de simulação em memória enquanto tenta reconectar...");
    inMemoryTraffic = generateSeedTrafficHistory();
    isDbConnected = false;
    pool = null;
    startDatabaseHeartbeat();
    scheduleReconnect(5000);
  }
}

// ==============================================================
// LISTINGS MYSQL & IN-MEMORY HELPERS
// ==============================================================
export async function getAllDbListings(): Promise<DbListingRecord[]> {
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT 
          id, title, description, price, currency, condition_type as \`condition\`,
          location, category_id as categoryId, seller_id as sellerId,
          seller_name as seller, seller_email as sellerEmail, seller_phone as phone,
          image_url as image, tags, is_featured as featured, is_pinned as isPinned,
          rating, promo_event_id as promoEventId, promo_discount as promoDiscount,
          promo_price as promoPrice, views_count as viewsCount, clicks_count as clicksCount,
          status, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as postedAt
        FROM listings
        WHERE status != 'deleted'
        ORDER BY is_pinned DESC, is_featured DESC, created_at DESC
      `)) as [mysql.RowDataPacket[], unknown];

      if (rows && rows.length > 0) {
        return rows.map((r: Record<string, unknown>) => {
          let parsedTags: string[] = [];
          if (r.tags) {
            try {
              parsedTags = typeof r.tags === "string" && r.tags.startsWith("[") ? JSON.parse(r.tags) : String(r.tags).split(",").map((t: string) => t.trim());
            } catch (_) {
              parsedTags = [String(r.tags)];
            }
          }
          return {
            id: String(r.id),
            title: String(r.title),
            description: String(r.description),
            price: Number(r.price),
            currency: (r.currency as string) || "AOA",
            condition: (r.condition as "novo" | "usado") || "usado",
            location: (r.location as string) || "Luanda, Angola",
            categoryId: String(r.categoryId),
            sellerId: r.sellerId ? String(r.sellerId) : undefined,
            seller: String(r.seller),
            sellerEmail: r.sellerEmail ? String(r.sellerEmail) : undefined,
            phone: (r.phone as string) || "",
            image: String(r.image),
            tags: parsedTags,
            featured: Boolean(r.featured),
            rating: Number(r.rating) || 5.0,
            promoEventId: r.promoEventId ? String(r.promoEventId) : undefined,
            promoDiscount: r.promoDiscount ? Number(r.promoDiscount) : undefined,
            promoPrice: r.promoPrice ? Number(r.promoPrice) : undefined,
            status: (r.status as string) || "active",
            postedAt: (r.postedAt as string) || "Recentemente"
          };
        });
      }
    } catch (e) {
      handleDbError(e, "getAllDbListings");
    }
  }
  return inMemoryListings.filter(l => l.status !== "deleted");
}

export async function getDbListingById(id: string): Promise<DbListingRecord | null> {
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT 
          id, title, description, price, currency, condition_type as \`condition\`,
          location, category_id as categoryId, seller_id as sellerId,
          seller_name as seller, seller_email as sellerEmail, seller_phone as phone,
          image_url as image, tags, is_featured as featured, is_pinned as isPinned,
          rating, promo_event_id as promoEventId, promo_discount as promoDiscount,
          promo_price as promoPrice, views_count as viewsCount, clicks_count as clicksCount,
          status, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as postedAt
        FROM listings
        WHERE id = ? AND status != 'deleted'
        LIMIT 1
      `, [id])) as [mysql.RowDataPacket[], unknown];

      if (rows && rows.length > 0) {
        const r = rows[0] as Record<string, unknown>;
        // Increment views count in background
        pool.query("UPDATE listings SET views_count = views_count + 1 WHERE id = ?", [id]).catch(() => {});
        
        let parsedTags: string[] = [];
        if (r.tags) {
          try {
            parsedTags = typeof r.tags === "string" && r.tags.startsWith("[") ? JSON.parse(r.tags) : String(r.tags).split(",").map((t: string) => t.trim());
          } catch (_) {
            parsedTags = [String(r.tags)];
          }
        }

        return {
          id: String(r.id),
          title: String(r.title),
          description: String(r.description),
          price: Number(r.price),
          currency: (r.currency as string) || "AOA",
          condition: (r.condition as "novo" | "usado") || "usado",
          location: (r.location as string) || "Luanda, Angola",
          categoryId: String(r.categoryId),
          sellerId: r.sellerId ? String(r.sellerId) : undefined,
          seller: String(r.seller),
          sellerEmail: r.sellerEmail ? String(r.sellerEmail) : undefined,
          phone: (r.phone as string) || "",
          image: String(r.image),
          tags: parsedTags,
          featured: Boolean(r.featured),
          rating: Number(r.rating) || 5.0,
          promoEventId: r.promoEventId ? String(r.promoEventId) : undefined,
          promoDiscount: r.promoDiscount ? Number(r.promoDiscount) : undefined,
          promoPrice: r.promoPrice ? Number(r.promoPrice) : undefined,
          status: (r.status as string) || "active",
          postedAt: (r.postedAt as string) || "Recentemente"
        };
      }
    } catch (e) {
      handleDbError(e, "getDbListingById");
    }
  }
  return inMemoryListings.find(l => l.id === id && l.status !== "deleted") || null;
}

export async function createDbListing(item: DbListingRecord): Promise<DbListingRecord> {
  const finalId = item.id || `lst-${Date.now()}`;
  const finalTags = Array.isArray(item.tags) ? item.tags : (item.tags ? String(item.tags).split(",").map(t => t.trim()) : []);
  const tagsStr = JSON.stringify(finalTags);

  const finalListing: DbListingRecord = {
    ...item,
    id: finalId,
    tags: finalTags,
    currency: item.currency || "AOA",
    condition: item.condition || "novo",
    location: item.location || "Luanda, Angola",
    rating: item.rating || 5.0,
    featured: !!item.featured,
    status: item.status || "active",
    postedAt: item.postedAt || "Agora mesmo"
  };

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO listings (
          id, title, description, price, currency, condition_type,
          location, category_id, seller_id, seller_name, seller_email,
          seller_phone, image_url, tags, is_featured, rating, promo_event_id,
          promo_discount, promo_price, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          price = VALUES(price),
          condition_type = VALUES(condition_type),
          location = VALUES(location),
          category_id = VALUES(category_id),
          seller_name = VALUES(seller_name),
          seller_phone = VALUES(seller_phone),
          image_url = VALUES(image_url),
          tags = VALUES(tags),
          is_featured = VALUES(is_featured),
          status = VALUES(status)
      `, [
        finalId,
        finalListing.title,
        finalListing.description,
        finalListing.price,
        finalListing.currency,
        finalListing.condition,
        finalListing.location,
        finalListing.categoryId,
        finalListing.sellerId || null,
        finalListing.seller,
        finalListing.sellerEmail || null,
        finalListing.phone,
        finalListing.image,
        tagsStr,
        finalListing.featured ? 1 : 0,
        finalListing.rating,
        finalListing.promoEventId || null,
        finalListing.promoDiscount || 0,
        finalListing.promoPrice || null,
        finalListing.status
      ]);
      console.log(`✅ Anúncio '${finalListing.title}' gravado com sucesso no MySQL!`);
    } catch (e) {
      handleDbError(e, "createDbListing");
    }
  }

  const existingIdx = inMemoryListings.findIndex(l => l.id === finalId);
  if (existingIdx >= 0) {
    inMemoryListings[existingIdx] = finalListing;
  } else {
    inMemoryListings.unshift(finalListing);
  }

  return finalListing;
}

export async function updateDbListing(id: string, updates: Partial<DbListingRecord>): Promise<boolean> {
  const tagsStr = updates.tags ? (Array.isArray(updates.tags) ? JSON.stringify(updates.tags) : String(updates.tags)) : null;

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        UPDATE listings
        SET 
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          condition_type = COALESCE(?, condition_type),
          location = COALESCE(?, location),
          category_id = COALESCE(?, category_id),
          seller_phone = COALESCE(?, seller_phone),
          image_url = COALESCE(?, image_url),
          tags = COALESCE(?, tags),
          status = COALESCE(?, status)
        WHERE id = ?
      `, [
        updates.title || null,
        updates.description || null,
        updates.price !== undefined ? updates.price : null,
        updates.condition || null,
        updates.location || null,
        updates.categoryId || null,
        updates.phone || null,
        updates.image || null,
        tagsStr,
        updates.status || null,
        id
      ]);
      return true;
    } catch (e) {
      handleDbError(e, "updateDbListing");
    }
  }

  const item = inMemoryListings.find(l => l.id === id);
  if (item) {
    Object.assign(item, updates);
    return true;
  }
  return false;
}

export async function deleteDbListing(id: string): Promise<boolean> {
  if (isDbConnected && pool) {
    try {
      await pool.query("UPDATE listings SET status = 'deleted' WHERE id = ?", [id]);
      return true;
    } catch (e) {
      handleDbError(e, "deleteDbListing");
    }
  }

  const idx = inMemoryListings.findIndex(l => l.id === id);
  if (idx >= 0) {
    inMemoryListings[idx].status = "deleted";
    return true;
  }
  return false;
}

export async function trackDbListingClick(id: string, type: "view" | "whatsapp" | "phone" | "share"): Promise<void> {
  if (isDbConnected && pool) {
    try {
      if (type === "whatsapp" || type === "phone" || type === "share") {
        await pool.query("UPDATE listings SET clicks_count = clicks_count + 1 WHERE id = ?", [id]);
      } else {
        await pool.query("UPDATE listings SET views_count = views_count + 1 WHERE id = ?", [id]);
      }
    } catch (e) {
      console.error("Error tracking listing click in MySQL:", e);
    }
  }
}

// ==============================================================
// MESSAGES / CHAT HELPERS
// ==============================================================
export async function getDbMessages(userEmailOrConvId: string): Promise<DbMessageRecord[]> {
  const cleanKey = userEmailOrConvId.trim().toLowerCase();
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT 
          id, conversation_id as conversationId, sender_id as senderId,
          sender_name as senderName, sender_email as senderEmail,
          receiver_id as receiverId, receiver_email as receiverEmail,
          listing_id as listingId, product_name as productName,
          content, image_url as image, is_from_buyer as isFromBuyer,
          DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as createdAt
        FROM messages
        WHERE conversation_id = ? OR LOWER(sender_email) = ? OR LOWER(receiver_email) = ?
        ORDER BY created_at ASC
      `, [cleanKey, cleanKey, cleanKey])) as [mysql.RowDataPacket[], unknown];

      return rows as unknown as DbMessageRecord[];
    } catch (e) {
      console.error("Error reading messages from MySQL:", e);
    }
  }

  return inMemoryMessages.filter(
    m => m.conversationId === cleanKey || m.senderEmail.toLowerCase() === cleanKey || (m.receiverEmail && m.receiverEmail.toLowerCase() === cleanKey)
  );
}

export async function createDbMessage(msg: Partial<DbMessageRecord>): Promise<DbMessageRecord> {
  const newMsg: DbMessageRecord = {
    id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    conversationId: msg.conversationId || "general",
    senderId: msg.senderId || "",
    senderName: msg.senderName || "Utilizador",
    senderEmail: (msg.senderEmail || "").trim().toLowerCase(),
    receiverId: msg.receiverId || undefined,
    receiverEmail: msg.receiverEmail ? msg.receiverEmail.trim().toLowerCase() : undefined,
    listingId: msg.listingId || undefined,
    productName: msg.productName || undefined,
    content: msg.content || "",
    image: msg.image || undefined,
    isFromBuyer: msg.isFromBuyer !== false,
    createdAt: msg.createdAt || new Date().toISOString()
  };

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO messages (
          id, conversation_id, sender_id, sender_name, sender_email,
          receiver_id, receiver_email, listing_id, product_name,
          content, image_url, is_from_buyer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newMsg.id,
        newMsg.conversationId,
        newMsg.senderId,
        newMsg.senderName,
        newMsg.senderEmail,
        newMsg.receiverId || null,
        newMsg.receiverEmail || null,
        newMsg.listingId || null,
        newMsg.productName || null,
        newMsg.content,
        newMsg.image || null,
        newMsg.isFromBuyer ? 1 : 0
      ]);
    } catch (e) {
      console.error("Error creating message in MySQL:", e);
    }
  }

  inMemoryMessages.push(newMsg);
  return newMsg;
}

// ==============================================================
// REPORTS / SAFETY HELPERS
// ==============================================================
export async function getDbReports(): Promise<DbReportRecord[]> {
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT 
          id, listing_id as listingId, listing_title as listingTitle,
          reporter_name as reporterName, reporter_email as reporterEmail,
          reason, details, status,
          DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as createdAt
        FROM reports
        ORDER BY created_at DESC
      `)) as [mysql.RowDataPacket[], unknown];

      return rows as unknown as DbReportRecord[];
    } catch (e) {
      console.error("Error reading reports from MySQL:", e);
    }
  }

  return inMemoryReports;
}

export async function createDbReport(rep: Partial<DbReportRecord>): Promise<DbReportRecord> {
  const newReport: DbReportRecord = {
    id: rep.id || `rep-${Date.now()}`,
    listingId: rep.listingId || "",
    listingTitle: rep.listingTitle || "Anúncio",
    reporterName: rep.reporterName || "Anónimo",
    reporterEmail: rep.reporterEmail || "",
    reason: rep.reason || "Conteúdo impróprio",
    details: rep.details || "",
    status: rep.status || "Pendente",
    createdAt: rep.createdAt || new Date().toISOString()
  };

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO reports (id, listing_id, listing_title, reporter_name, reporter_email, reason, details, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newReport.id,
        newReport.listingId,
        newReport.listingTitle,
        newReport.reporterName,
        newReport.reporterEmail || null,
        newReport.reason,
        newReport.details,
        newReport.status
      ]);
    } catch (e) {
      console.error("Error creating report in MySQL:", e);
    }
  }

  inMemoryReports.unshift(newReport);
  return newReport;
}

// ==============================================================
// TRAFFIC & ANALYTICS HELPERS
// ==============================================================
export async function getTrafficHistory(): Promise<DailyTrafficRecord[]> {
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT 
          DATE_FORMAT(traffic_date, '%Y-%m-%d') as date,
          views_total as viewsTotal,
          views_new as viewsNew,
          views_registered as viewsRegistered,
          shares_count as shares,
          signups_count as signups,
          ref_direct as direct,
          ref_search as search,
          ref_share_link as shareLink,
          ref_whatsapp as whatsapp
        FROM platform_traffic_analytics
        ORDER BY traffic_date ASC
      `)) as [mysql.RowDataPacket[], unknown];
      return rows as unknown as DailyTrafficRecord[];
    } catch (e) {
      console.error("Error reading traffic history from MySQL:", e);
    }
  }
  return inMemoryTraffic;
}

export async function incrementVisit(isRegistered: boolean, source: "direct" | "search" | "share" | "whatsapp") {
  const todayStr = new Date().toISOString().split("T")[0];

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO platform_traffic_analytics (
          traffic_date, views_total, views_new, views_registered,
          ref_direct, ref_search, ref_share_link, ref_whatsapp
        ) VALUES (
          ?, 1, ?, ?,
          ?, ?, ?, ?
        ) ON DUPLICATE KEY UPDATE
          views_total = views_total + 1,
          views_new = views_new + ?,
          views_registered = views_registered + ?,
          ref_direct = ref_direct + ?,
          ref_search = ref_search + ?,
          ref_share_link = ref_share_link + ?,
          ref_whatsapp = ref_whatsapp + ?
      `, [
        todayStr,
        isRegistered ? 0 : 1, isRegistered ? 1 : 0,
        source === "direct" ? 1 : 0, source === "search" ? 1 : 0, source === "share" ? 1 : 0, source === "whatsapp" ? 1 : 0,
        isRegistered ? 0 : 1, isRegistered ? 1 : 0,
        source === "direct" ? 1 : 0, source === "search" ? 1 : 0, source === "share" ? 1 : 0, source === "whatsapp" ? 1 : 0
      ]);
      return;
    } catch (e) {
      console.error("Error incrementing visit in MySQL:", e);
    }
  }

  let todayRec = inMemoryTraffic.find(r => r.date === todayStr);
  if (!todayRec) {
    todayRec = {
      date: todayStr,
      viewsTotal: 0, viewsNew: 0, viewsRegistered: 0,
      shares: 0, signups: 0,
      direct: 0, search: 0, shareLink: 0, whatsapp: 0
    };
    inMemoryTraffic.push(todayRec);
  }
  todayRec.viewsTotal += 1;
  if (isRegistered) todayRec.viewsRegistered += 1;
  else todayRec.viewsNew += 1;

  if (source === "direct") todayRec.direct += 1;
  else if (source === "search") todayRec.search += 1;
  else if (source === "share") todayRec.shareLink += 1;
  else if (source === "whatsapp") todayRec.whatsapp += 1;

  if (inMemoryTraffic.length > 90) inMemoryTraffic.shift();
}

export async function incrementShare() {
  const todayStr = new Date().toISOString().split("T")[0];

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO platform_traffic_analytics (
          traffic_date, views_total, views_new, shares_count, ref_direct
        ) VALUES (
          ?, 1, 1, 1, 1
        ) ON DUPLICATE KEY UPDATE
          shares_count = shares_count + 1
      `, [todayStr]);
      return;
    } catch (e) {
      console.error("Error incrementing share in MySQL:", e);
    }
  }

  let todayRec = inMemoryTraffic.find(r => r.date === todayStr);
  if (!todayRec) {
    todayRec = {
      date: todayStr,
      viewsTotal: 1, viewsNew: 1, viewsRegistered: 0,
      shares: 0, signups: 0,
      direct: 1, search: 0, shareLink: 0, whatsapp: 0
    };
    inMemoryTraffic.push(todayRec);
  }
  todayRec.shares += 1;
}

export async function incrementSignup() {
  const todayStr = new Date().toISOString().split("T")[0];

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO platform_traffic_analytics (
          traffic_date, views_total, views_new, signups_count, ref_direct
        ) VALUES (
          ?, 1, 1, 1, 1
        ) ON DUPLICATE KEY UPDATE
          signups_count = signups_count + 1
      `, [todayStr]);
      return;
    } catch (e) {
      console.error("Error incrementing signup in MySQL:", e);
    }
  }

  let todayRec = inMemoryTraffic.find(r => r.date === todayStr);
  if (!todayRec) {
    todayRec = {
      date: todayStr,
      viewsTotal: 1, viewsNew: 1, viewsRegistered: 0,
      shares: 0, signups: 0,
      direct: 1, search: 0, shareLink: 0, whatsapp: 0
    };
    inMemoryTraffic.push(todayRec);
  }
  todayRec.signups += 1;
}

// ==============================================================
// USER AUTHENTICATION & PROFILE MYSQL HELPERS
// ==============================================================
export async function findDbUserByEmail(email: string): Promise<DbUserRecord | null> {
  const cleanEmail = email.trim().toLowerCase();
  let user: DbUserRecord | null = null;

  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(
        "SELECT id, name, email, password_hash as password, phone, role, avatar, location, security_question as securityQuestion, security_answer as securityAnswer, status, DATE_FORMAT(created_at, '%d/%m/%Y') as registeredAt FROM users WHERE LOWER(email) = ?",
        [cleanEmail]
      )) as [mysql.RowDataPacket[], unknown];
      if (rows && rows.length > 0) {
        user = rows[0] as unknown as DbUserRecord;
      }
    } catch (e) {
      console.error("Error finding user in MySQL:", e);
    }
  }

  if (!user) {
    user = inMemoryUsers.find(u => u.email.toLowerCase() === cleanEmail) || null;
  }

  if (user && isAdminEmail(user.email)) {
    user.role = "admin";
  }

  return user;
}

export function getPhoneCoreDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("244") && digits.length === 12) {
    return digits.slice(3);
  }
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

export function normalizePhoneNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;

  const core = getPhoneCoreDigits(trimmed);
  if (core.length === 9 && core.startsWith("9")) {
    return `+244 ${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`;
  }
  if (core.length === 9) {
    return `${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`;
  }
  return trimmed;
}

export async function findDbUserByIdentifier(identifier: string): Promise<DbUserRecord | null> {
  const clean = identifier.trim().toLowerCase();
  const coreDigits = getPhoneCoreDigits(identifier);
  let user: DbUserRecord | null = null;
  
  if (isDbConnected && pool) {
    try {
      if (coreDigits && coreDigits.length >= 9) {
        const [rows] = (await pool.query(`
          SELECT id, name, email, password_hash as password, phone, role, avatar, location, security_question as securityQuestion, security_answer as securityAnswer, status, DATE_FORMAT(created_at, '%d/%m/%Y') as registeredAt 
          FROM users 
          WHERE LOWER(email) = ? OR (phone IS NOT NULL AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '244', ''), 9) = ?)
          LIMIT 1
        `, [clean, coreDigits.slice(-9)])) as [mysql.RowDataPacket[], unknown];
        
        if (rows && rows.length > 0) {
          user = rows[0] as unknown as DbUserRecord;
        }
      } else {
        const [rows] = (await pool.query(`
          SELECT id, name, email, password_hash as password, phone, role, avatar, location, security_question as securityQuestion, security_answer as securityAnswer, status, DATE_FORMAT(created_at, '%d/%m/%Y') as registeredAt 
          FROM users 
          WHERE LOWER(email) = ?
          LIMIT 1
        `, [clean])) as [mysql.RowDataPacket[], unknown];
        
        if (rows && rows.length > 0) {
          user = rows[0] as unknown as DbUserRecord;
        }
      }
    } catch (e) {
      console.error("Error finding user by identifier in MySQL:", e);
    }
  }

  if (!user) {
    user = inMemoryUsers.find(u => {
      if (u.email.toLowerCase() === clean) return true;
      if (coreDigits && coreDigits.length >= 9 && u.phone) {
        const uCore = getPhoneCoreDigits(u.phone);
        return uCore.slice(-9) === coreDigits.slice(-9);
      }
      return false;
    }) || null;
  }

  if (user && isAdminEmail(user.email)) {
    user.role = "admin";
  }

  return user;
}

export async function createDbUser(user: DbUserRecord): Promise<DbUserRecord> {
  const cleanEmail = user.email.trim().toLowerCase();
  const cleanPhone = normalizePhoneNumber(user.phone);
  const userRole = isAdminEmail(cleanEmail) ? "admin" : (user.role || "user");
  const registeredAt = user.registeredAt || new Date().toLocaleDateString("pt-AO");
  
  let hashedPassword: string | null = null;
  if (user.password) {
    hashedPassword = (user.password.startsWith("$2a$") || user.password.startsWith("$2b$") || user.password.startsWith("$2y$"))
      ? user.password
      : await hashPassword(user.password);
  }

  let hashedSecurityAnswer: string | null = null;
  if (user.securityAnswer) {
    const rawAnswer = user.securityAnswer.trim().toLowerCase();
    hashedSecurityAnswer = (rawAnswer.startsWith("$2a$") || rawAnswer.startsWith("$2b$") || rawAnswer.startsWith("$2y$"))
      ? rawAnswer
      : await hashPassword(rawAnswer);
  }
  
  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO users (id, name, email, password_hash, phone, role, avatar, location, security_question, security_answer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          phone = VALUES(phone),
          password_hash = VALUES(password_hash),
          avatar = VALUES(avatar),
          location = VALUES(location),
          security_question = VALUES(security_question),
          security_answer = VALUES(security_answer)
      `, [
        user.id,
        user.name,
        cleanEmail,
        hashedPassword,
        cleanPhone || null,
        userRole,
        user.avatar || user.name.slice(0, 2).toUpperCase(),
        user.location || "Luanda, Angola",
        user.securityQuestion || "Qual é a tua comida tradicional angolana favorita?",
        hashedSecurityAnswer
      ]);
    } catch (e) {
      console.error("Error creating user in MySQL:", e);
    }
  }

  const record: DbUserRecord = {
    ...user,
    email: cleanEmail,
    phone: cleanPhone || user.phone,
    role: userRole,
    password: hashedPassword || undefined,
    securityAnswer: hashedSecurityAnswer || undefined,
    registeredAt
  };

  const existingIdx = inMemoryUsers.findIndex(u => u.email.toLowerCase() === cleanEmail);
  if (existingIdx >= 0) {
    inMemoryUsers[existingIdx] = record;
    return record;
  } else {
    inMemoryUsers.push(record);
    return record;
  }
}

export async function updateDbUserProfile(email: string, updates: { name?: string; phone?: string; location?: string; avatar?: string; securityQuestion?: string; securityAnswer?: string }): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  let hashedSecurityAnswer: string | null = null;
  if (updates.securityAnswer) {
    const rawAnswer = updates.securityAnswer.trim().toLowerCase();
    hashedSecurityAnswer = (rawAnswer.startsWith("$2a$") || rawAnswer.startsWith("$2b$") || rawAnswer.startsWith("$2y$"))
      ? rawAnswer
      : await hashPassword(rawAnswer);
  }

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        UPDATE users 
        SET 
          name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          location = COALESCE(?, location),
          avatar = COALESCE(?, avatar),
          security_question = COALESCE(?, security_question),
          security_answer = COALESCE(?, security_answer)
        WHERE LOWER(email) = ?
      `, [
        updates.name || null, 
        updates.phone || null, 
        updates.location || null, 
        updates.avatar || null,
        updates.securityQuestion || null,
        hashedSecurityAnswer,
        cleanEmail
      ]);
      return true;
    } catch (e) {
      console.error("Error updating user in MySQL:", e);
    }
  }

  const user = inMemoryUsers.find(u => u.email.toLowerCase() === cleanEmail);
  if (user) {
    if (updates.name) user.name = updates.name;
    if (updates.phone) user.phone = updates.phone;
    if (updates.location) user.location = updates.location;
    if (updates.avatar) user.avatar = updates.avatar;
    if (updates.securityQuestion) user.securityQuestion = updates.securityQuestion;
    if (hashedSecurityAnswer) user.securityAnswer = hashedSecurityAnswer;
    return true;
  }
  return false;
}

export async function getSecurityQuestionForUser(identifier: string): Promise<{ question: string; email: string } | null> {
  const user = await findDbUserByIdentifier(identifier);
  if (!user) return null;
  return {
    question: user.securityQuestion || "Qual é a tua comida tradicional angolana favorita?",
    email: user.email
  };
}

export async function resetPasswordWithSecurityAnswer(identifier: string, answer: string, newPassword: string): Promise<boolean> {
  const user = await findDbUserByIdentifier(identifier);
  if (!user || !user.securityAnswer) return false;

  const providedAnswer = (answer || "").trim().toLowerCase();
  if (!providedAnswer) return false;

  const isAnswerValid = await verifyPassword(providedAnswer, user.securityAnswer);
  if (!isAnswerValid) {
    return false;
  }

  const hashedPassword = await hashPassword(newPassword);

  if (isDbConnected && pool) {
    try {
      await pool.query("UPDATE users SET password_hash = ? WHERE LOWER(email) = ?", [hashedPassword, user.email.toLowerCase()]);
    } catch (e) {
      console.error("Error resetting password in MySQL:", e);
    }
  }

  user.password = hashedPassword;
  return true;
}

export async function getAllDbUsers(): Promise<Omit<DbUserRecord, "password" | "securityAnswer">[]> {
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT 
          id, name, email, phone, role, avatar, location, status,
          security_question as securityQuestion,
          DATE_FORMAT(created_at, '%d/%m/%Y') as registeredAt
        FROM users
        ORDER BY created_at DESC
      `)) as [mysql.RowDataPacket[], unknown];

      return rows as unknown as Omit<DbUserRecord, "password" | "securityAnswer">[];
    } catch (e) {
      console.error("Error loading users for admin in MySQL:", e);
    }
  }

  return inMemoryUsers.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || "Não informado",
    role: u.role || "user",
    avatar: u.avatar || u.name.slice(0, 2).toUpperCase(),
    location: u.location || "Luanda, Angola",
    status: u.status || "active",
    securityQuestion: u.securityQuestion,
    registeredAt: u.registeredAt || "Recentemente"
  }));
}

export async function updateDbUserStatus(userId: string, status: string): Promise<boolean> {
  if (isDbConnected && pool) {
    try {
      await pool.query("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
      return true;
    } catch (e) {
      console.error("Error updating user status in MySQL:", e);
    }
  }

  const u = inMemoryUsers.find(user => user.id === userId);
  if (u) {
    u.status = status;
    return true;
  }
  return false;
}

export interface DbBannerRecord {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  buttonText: string;
  isActive: boolean;
}

export async function getAllDbBanners(): Promise<DbBannerRecord[]> {
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT id, title, subtitle, image_url as image, link_url as link, button_text as buttonText, is_active as isActive 
        FROM banners 
        WHERE is_active = 1
        ORDER BY id ASC
      `)) as [mysql.RowDataPacket[], unknown];
      
      if (rows && rows.length > 0) {
        return rows.map(r => ({
          ...r,
          isActive: Boolean(r.isActive)
        })) as DbBannerRecord[];
      }
    } catch (e) {
      console.error("Error fetching banners from MySQL:", e);
    }
  }

  return [
    {
      id: "b1",
      title: "Grande Inauguração Aqkianda",
      subtitle: "A maior plataforma de negócios em Angola chegou! Descontos especiais de parceiros.",
      image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1920&q=80",
      link: "/explorar",
      buttonText: "Explorar Ofertas",
      isActive: true
    },
    {
      id: "b2",
      title: "Campanha Cacimbo Tech",
      subtitle: "Smartphones, Laptops e Acessórios com até 30% de desconto real.",
      image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1920&q=80",
      link: "/explorar?cat=eletronica",
      buttonText: "Ver Tecnologia",
      isActive: true
    },
    {
      id: "b3",
      title: "Automóveis & Imóveis",
      subtitle: "Encontre os melhores carros e casas de Luanda às melhores condições.",
      image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=80",
      link: "/explorar?cat=viaturas",
      buttonText: "Ver Imóveis",
      isActive: true
    }
  ];
}

export async function createDbBanner(banner: DbBannerRecord): Promise<DbBannerRecord> {
  const newId = banner.id || `b-${Date.now()}`;
  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO banners (id, title, subtitle, image_url, link_url, button_text, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          subtitle = VALUES(subtitle),
          image_url = VALUES(image_url),
          link_url = VALUES(link_url),
          button_text = VALUES(button_text),
          is_active = VALUES(is_active)
      `, [
        newId,
        banner.title || "",
        banner.subtitle || "",
        banner.image || "",
        banner.link || "",
        banner.buttonText || "Ver Mais",
        banner.isActive !== false ? 1 : 0
      ]);
    } catch (e) {
      console.error("Error creating banner in MySQL:", e);
    }
  }
  return { ...banner, id: newId, isActive: banner.isActive !== false };
}

export async function deleteDbBanner(id: string): Promise<boolean> {
  if (isDbConnected && pool) {
    try {
      await pool.query("DELETE FROM banners WHERE id = ?", [id]);
      return true;
    } catch (e) {
      console.error("Error deleting banner from MySQL:", e);
    }
  }
  return true;
}

// ==============================================================
// BLOG POSTS MYSQL HELPERS
// ==============================================================
export async function getAllDbBlogPosts(onlyPublished: boolean = true): Promise<DbBlogPostRecord[]> {
  if (isDbConnected && pool) {
    try {
      const query = onlyPublished
        ? "SELECT id, slug, title, summary, content, cover_image as coverImage, category, author_name as authorName, author_avatar as authorAvatar, views_count as viewsCount, is_published as isPublished, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as createdAt FROM blog_posts WHERE is_published = 1 ORDER BY created_at DESC"
        : "SELECT id, slug, title, summary, content, cover_image as coverImage, category, author_name as authorName, author_avatar as authorAvatar, views_count as viewsCount, is_published as isPublished, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as createdAt FROM blog_posts ORDER BY created_at DESC";

      const [rows] = (await pool.query(query)) as [mysql.RowDataPacket[], unknown];
      if (rows && rows.length > 0) {
        return rows.map(r => ({
          ...r,
          isPublished: Boolean(r.isPublished)
        })) as unknown as DbBlogPostRecord[];
      }
    } catch (e) {
      console.error("Error fetching blog posts from MySQL:", e);
    }
  }

  return inMemoryBlogPosts.filter(b => !onlyPublished || b.isPublished);
}

export async function getDbBlogPostBySlugOrId(identifier: string): Promise<DbBlogPostRecord | null> {
  const clean = identifier.trim().toLowerCase();
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT id, slug, title, summary, content, cover_image as coverImage, category, author_name as authorName, author_avatar as authorAvatar, views_count as viewsCount, is_published as isPublished, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as createdAt 
        FROM blog_posts 
        WHERE LOWER(slug) = ? OR id = ?
        LIMIT 1
      `, [clean, identifier])) as [mysql.RowDataPacket[], unknown];

      if (rows && rows.length > 0) {
        const item = rows[0] as Record<string, unknown>;
        pool.query("UPDATE blog_posts SET views_count = views_count + 1 WHERE id = ?", [item.id]).catch(() => {});
        return {
          ...item,
          isPublished: Boolean(item.isPublished)
        } as unknown as DbBlogPostRecord;
      }
    } catch (e) {
      console.error("Error fetching single blog post from MySQL:", e);
    }
  }

  const post = inMemoryBlogPosts.find(b => b.slug.toLowerCase() === clean || b.id === identifier);
  if (post) {
    post.viewsCount = (post.viewsCount || 0) + 1;
    return post;
  }
  return null;
}

export async function createDbBlogPost(post: Partial<DbBlogPostRecord>): Promise<DbBlogPostRecord> {
  const newId = post.id || `blog-${Date.now()}`;
  const rawSlug = post.slug || (post.title ? post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : `post-${Date.now()}`);
  
  const record: DbBlogPostRecord = {
    id: newId,
    slug: rawSlug,
    title: post.title || "Novo Artigo",
    summary: post.summary || "",
    content: post.content || "",
    coverImage: post.coverImage || "https://images.unsplash.com/photo-1556742049-0a67dd3a921d?auto=format&fit=crop&w=1200&q=80",
    category: post.category || "Geral",
    authorName: post.authorName || "Equipa Aqkianda",
    authorAvatar: post.authorAvatar || "AQ",
    viewsCount: post.viewsCount || 0,
    isPublished: post.isPublished !== false,
    createdAt: post.createdAt || new Date().toISOString()
  };

  if (isDbConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO blog_posts (id, slug, title, summary, content, cover_image, category, author_name, author_avatar, views_count, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          slug = VALUES(slug),
          title = VALUES(title),
          summary = VALUES(summary),
          content = VALUES(content),
          cover_image = VALUES(cover_image),
          category = VALUES(category),
          author_name = VALUES(author_name),
          author_avatar = VALUES(author_avatar),
          is_published = VALUES(is_published)
      `, [
        record.id,
        record.slug,
        record.title,
        record.summary,
        record.content,
        record.coverImage,
        record.category,
        record.authorName,
        record.authorAvatar || "AQ",
        record.viewsCount || 0,
        record.isPublished ? 1 : 0
      ]);
    } catch (e) {
      console.error("Error creating blog post in MySQL:", e);
    }
  }

  const existingIdx = inMemoryBlogPosts.findIndex(b => b.id === record.id);
  if (existingIdx >= 0) inMemoryBlogPosts[existingIdx] = record;
  else inMemoryBlogPosts.unshift(record);

  return record;
}

export async function updateDbBlogPost(id: string, updates: Partial<DbBlogPostRecord>): Promise<boolean> {
  if (isDbConnected && pool) {
    try {
      await pool.query(`
        UPDATE blog_posts
        SET
          title = COALESCE(?, title),
          slug = COALESCE(?, slug),
          summary = COALESCE(?, summary),
          content = COALESCE(?, content),
          cover_image = COALESCE(?, cover_image),
          category = COALESCE(?, category),
          is_published = COALESCE(?, is_published)
        WHERE id = ?
      `, [
        updates.title || null,
        updates.slug || null,
        updates.summary || null,
        updates.content || null,
        updates.coverImage || null,
        updates.category || null,
        updates.isPublished !== undefined ? (updates.isPublished ? 1 : 0) : null,
        id
      ]);
      return true;
    } catch (e) {
      console.error("Error updating blog post in MySQL:", e);
    }
  }

  const post = inMemoryBlogPosts.find(b => b.id === id);
  if (post) {
    Object.assign(post, updates);
    return true;
  }
  return false;
}

export async function deleteDbBlogPost(id: string): Promise<boolean> {
  if (isDbConnected && pool) {
    try {
      await pool.query("DELETE FROM blog_posts WHERE id = ?", [id]);
      return true;
    } catch (e) {
      console.error("Error deleting blog post from MySQL:", e);
    }
  }

  const idx = inMemoryBlogPosts.findIndex(b => b.id === id);
  if (idx >= 0) {
    inMemoryBlogPosts.splice(idx, 1);
    return true;
  }
  return false;
}

// ==========================================================
// FAVORITOS (sincronizados por conta)
// ==========================================================
export async function getDbFavorites(userEmail: string): Promise<string[]> {
  if (!isDbConnected || !pool) return [];

  try {
    const [rows] = (await pool.query(
      "SELECT listing_id as listingId FROM favorites WHERE user_email = ? ORDER BY created_at DESC",
      [userEmail.trim().toLowerCase()]
    )) as [mysql.RowDataPacket[], unknown];

    return rows.map(r => String(r.listingId));
  } catch (e) {
    console.error("Error loading favorites from MySQL:", e);
    return [];
  }
}

export async function saveDbFavorites(userEmail: string, listingIds: string[]): Promise<void> {
  if (!isDbConnected || !pool) {
    throw new Error("Base de dados indisponível.");
  }

  const email = userEmail.trim().toLowerCase();
  const uniqueIds = Array.from(new Set((listingIds || []).filter(Boolean))).slice(0, 500);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM favorites WHERE user_email = ?", [email]);
    for (const listingId of uniqueIds) {
      await conn.query(
        "INSERT IGNORE INTO favorites (user_email, listing_id) VALUES (?, ?)",
        [email, listingId]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error("Error saving favorites to MySQL:", e);
    throw e;
  } finally {
    conn.release();
  }
}

// ==========================================================
// AVALIAÇÕES (sincronizadas por conta)
// ==========================================================
export async function getDbRatings(userEmail: string): Promise<Record<string, number>> {
  if (!isDbConnected || !pool) return {};

  try {
    const [rows] = (await pool.query(
      "SELECT listing_id as listingId, rating FROM ratings WHERE user_email = ?",
      [userEmail.trim().toLowerCase()]
    )) as [mysql.RowDataPacket[], unknown];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[String(row.listingId)] = Number(row.rating);
    }
    return result;
  } catch (e) {
    console.error("Error loading ratings from MySQL:", e);
    return {};
  }
}

export async function saveDbRatings(userEmail: string, ratings: Record<string, number>): Promise<void> {
  if (!isDbConnected || !pool) {
    throw new Error("Base de dados indisponível.");
  }

  const email = userEmail.trim().toLowerCase();
  const entries = Object.entries(ratings || {})
    .filter(([listingId, rating]) => Boolean(listingId) && Number.isFinite(Number(rating)))
    .slice(0, 500);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM ratings WHERE user_email = ?", [email]);
    for (const [listingId, rating] of entries) {
      await conn.query(
        "INSERT INTO ratings (user_email, listing_id, rating) VALUES (?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE rating = VALUES(rating)",
        [email, listingId, Math.max(1, Math.min(5, Math.round(Number(rating))))]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error("Error saving ratings to MySQL:", e);
    throw e;
  } finally {
    conn.release();
  }
}

