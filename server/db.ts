import mysql from "mysql2/promise";

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
    
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const growthFactor = 1 + (29 - i) * 0.04;
    const baseViews = isWeekend ? 180 : 260;
    const viewsTotal = Math.floor(baseViews * growthFactor + Math.random() * 40);
    const viewsNew = Math.floor(viewsTotal * 0.68);
    const viewsRegistered = viewsTotal - viewsNew;
    
    const shares = Math.floor(viewsTotal * 0.12 + Math.random() * 5);
    const signups = Math.floor(viewsTotal * 0.05 + Math.random() * 3);
    
    const direct = Math.floor(viewsTotal * 0.35);
    const search = Math.floor(viewsTotal * 0.30);
    const shareLink = Math.floor(viewsTotal * 0.15);
    const whatsapp = viewsTotal - (direct + search + shareLink);
    
    list.push({
      date: dateStr,
      viewsTotal,
      viewsNew,
      viewsRegistered,
      shares,
      signups,
      direct,
      search,
      shareLink,
      whatsapp,
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

// In-memory fallback stores
let inMemoryTraffic: DailyTrafficRecord[] = [];
const inMemoryUsers: DbUserRecord[] = [
  {
    id: "usr-admin-1",
    name: "Administrador Aqkianda",
    email: ADMIN_EMAIL,
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

    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000
    });

    const conn = await pool.getConnection();
    console.log("✅ Conectado com sucesso ao MySQL!");
    conn.release();
    isDbConnected = true;

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

    console.warn("⚠️ A reverter para o modo de simulação em memória.");
    inMemoryTraffic = generateSeedTrafficHistory();
    isDbConnected = false;
    pool = null;
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
        return rows.map((r: any) => {
          let parsedTags: string[] = [];
          if (r.tags) {
            try {
              parsedTags = typeof r.tags === "string" && r.tags.startsWith("[") ? JSON.parse(r.tags) : r.tags.split(",").map((t: string) => t.trim());
            } catch (_) {
              parsedTags = [String(r.tags)];
            }
          }
          return {
            id: String(r.id),
            title: r.title,
            description: r.description,
            price: Number(r.price),
            currency: r.currency || "AOA",
            condition: r.condition || "usado",
            location: r.location || "Luanda, Angola",
            categoryId: r.categoryId,
            sellerId: r.sellerId || undefined,
            seller: r.seller,
            sellerEmail: r.sellerEmail || undefined,
            phone: r.phone || "",
            image: r.image,
            tags: parsedTags,
            featured: Boolean(r.featured),
            rating: Number(r.rating) || 5.0,
            promoEventId: r.promoEventId || undefined,
            promoDiscount: r.promoDiscount ? Number(r.promoDiscount) : undefined,
            promoPrice: r.promoPrice ? Number(r.promoPrice) : undefined,
            status: r.status,
            postedAt: r.postedAt || "Recentemente"
          };
        });
      }
    } catch (e) {
      console.error("Error fetching listings from MySQL:", e);
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
        const r = rows[0] as any;
        // Increment views count in background
        pool.query("UPDATE listings SET views_count = views_count + 1 WHERE id = ?", [id]).catch(() => {});
        
        let parsedTags: string[] = [];
        if (r.tags) {
          try {
            parsedTags = typeof r.tags === "string" && r.tags.startsWith("[") ? JSON.parse(r.tags) : r.tags.split(",").map((t: string) => t.trim());
          } catch (_) {
            parsedTags = [String(r.tags)];
          }
        }

        return {
          id: String(r.id),
          title: r.title,
          description: r.description,
          price: Number(r.price),
          currency: r.currency || "AOA",
          condition: r.condition || "usado",
          location: r.location || "Luanda, Angola",
          categoryId: r.categoryId,
          sellerId: r.sellerId || undefined,
          seller: r.seller,
          sellerEmail: r.sellerEmail || undefined,
          phone: r.phone || "",
          image: r.image,
          tags: parsedTags,
          featured: Boolean(r.featured),
          rating: Number(r.rating) || 5.0,
          promoEventId: r.promoEventId || undefined,
          promoDiscount: r.promoDiscount ? Number(r.promoDiscount) : undefined,
          promoPrice: r.promoPrice ? Number(r.promoPrice) : undefined,
          status: r.status,
          postedAt: r.postedAt || "Recentemente"
        };
      }
    } catch (e) {
      console.error("Error fetching listing by ID from MySQL:", e);
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
      console.error("Error creating listing in MySQL:", e);
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
      console.error("Error updating listing in MySQL:", e);
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
      console.error("Error deleting listing in MySQL:", e);
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

export async function findDbUserByIdentifier(identifier: string): Promise<DbUserRecord | null> {
  const clean = identifier.trim().toLowerCase();
  const digitsOnly = identifier.replace(/\D/g, "");
  let user: DbUserRecord | null = null;
  
  if (isDbConnected && pool) {
    try {
      const [rows] = (await pool.query(`
        SELECT id, name, email, password_hash as password, phone, role, avatar, location, security_question as securityQuestion, security_answer as securityAnswer, status, DATE_FORMAT(created_at, '%d/%m/%Y') as registeredAt 
        FROM users 
        WHERE LOWER(email) = ? OR (phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)
        LIMIT 1
      `, [clean, `%${digitsOnly ? digitsOnly.slice(-9) : "___NOT_MATCH___"}%`])) as [mysql.RowDataPacket[], unknown];
      
      if (rows && rows.length > 0) {
        user = rows[0] as unknown as DbUserRecord;
      }
    } catch (e) {
      console.error("Error finding user by identifier in MySQL:", e);
    }
  }

  if (!user) {
    user = inMemoryUsers.find(u => 
      u.email.toLowerCase() === clean || 
      (digitsOnly.length >= 7 && u.phone && u.phone.replace(/\D/g, "").includes(digitsOnly.slice(-7)))
    ) || null;
  }

  if (user && isAdminEmail(user.email)) {
    user.role = "admin";
  }

  return user;
}

export async function createDbUser(user: DbUserRecord): Promise<DbUserRecord> {
  const cleanEmail = user.email.trim().toLowerCase();
  const userRole = isAdminEmail(cleanEmail) ? "admin" : (user.role || "user");
  const registeredAt = user.registeredAt || new Date().toLocaleDateString("pt-AO");
  
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
        user.password || null,
        user.phone || null,
        userRole,
        user.avatar || user.name.slice(0, 2).toUpperCase(),
        user.location || "Luanda, Angola",
        user.securityQuestion || "Qual é a tua comida tradicional angolana favorita?",
        user.securityAnswer ? user.securityAnswer.trim().toLowerCase() : null
      ]);
    } catch (e) {
      console.error("Error creating user in MySQL:", e);
    }
  }

  const record: DbUserRecord = {
    ...user,
    email: cleanEmail,
    role: userRole,
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
        updates.securityAnswer ? updates.securityAnswer.trim().toLowerCase() : null,
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
    if (updates.securityAnswer) user.securityAnswer = updates.securityAnswer.trim().toLowerCase();
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
  if (!user) return false;

  const storedAnswer = (user.securityAnswer || "").trim().toLowerCase();
  const providedAnswer = answer.trim().toLowerCase();

  // If user didn't have a security answer set, allow fallback verification if not empty
  if (storedAnswer && storedAnswer !== providedAnswer) {
    return false;
  }

  if (isDbConnected && pool) {
    try {
      await pool.query("UPDATE users SET password_hash = ? WHERE LOWER(email) = ?", [newPassword, user.email.toLowerCase()]);
    } catch (e) {
      console.error("Error resetting password in MySQL:", e);
    }
  }

  user.password = newPassword;
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
