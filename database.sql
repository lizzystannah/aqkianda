-- =============================================================
-- Aqkianda Marketplace — Complete MySQL Database Schema
-- Optimized for MySQL 8.0+ / MariaDB on Linux VPS
-- =============================================================

CREATE DATABASE IF NOT EXISTS `aqkianda_db` 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `aqkianda_db`;

-- -------------------------------------------------------------
-- 1. USERS TABLE (Utilizadores & Vendedores)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `role` ENUM('user', 'seller', 'admin') NOT NULL DEFAULT 'user',
  `avatar` VARCHAR(255) DEFAULT NULL,
  `location` VARCHAR(100) DEFAULT 'Luanda, Angola',
  `status` ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. CATEGORIES TABLE (Categorias de Produtos)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(64) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `icon` VARCHAR(50) NOT NULL DEFAULT 'Package',
  `description` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  INDEX `idx_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 3. LISTINGS TABLE (Anúncios & Publicações)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `listings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'AOA',
  `condition_type` ENUM('novo', 'usado') NOT NULL DEFAULT 'usado',
  `location` VARCHAR(150) NOT NULL DEFAULT 'Luanda, Angola',
  `category_id` VARCHAR(64) NOT NULL,
  `seller_id` VARCHAR(64) NOT NULL,
  `seller_name` VARCHAR(150) NOT NULL,
  `seller_phone` VARCHAR(50) DEFAULT NULL,
  `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `promo_event_id` VARCHAR(64) DEFAULT NULL,
  `promo_discount` INT DEFAULT 0,
  `promo_price` DECIMAL(15,2) DEFAULT NULL,
  `views_count` INT NOT NULL DEFAULT 0,
  `clicks_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('active', 'sold', 'paused', 'deleted') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_listings_seller` (`seller_id`),
  INDEX `idx_listings_category` (`category_id`),
  INDEX `idx_listings_status` (`status`),
  INDEX `idx_listings_pinned` (`is_pinned`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 4. LISTING IMAGES TABLE (Fotografias dos Anúncios)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `listing_images` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `listing_id` VARCHAR(64) NOT NULL,
  `image_url` TEXT NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 5. BANNERS / SLIDESHOW TABLE (Carrossel Principal)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `banners` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) DEFAULT NULL,
  `subtitle` TEXT DEFAULT NULL,
  `image_url` LONGTEXT NOT NULL,
  `link_url` VARCHAR(255) DEFAULT NULL,
  `button_text` VARCHAR(100) DEFAULT 'Ver Oferta',
  `listing_id` VARCHAR(64) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 6. PROMO EVENTS TABLE (Campanhas de Desconto)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promos` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `discounts_json` JSON DEFAULT NULL,
  `status` ENUM('active', 'finished', 'draft') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 7. FAVORITES TABLE (Favoritos dos Compradores)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `favorites` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `listing_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_user_listing` (`user_id`, `listing_id`),
  FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 8. REPORTS TABLE (Denúncias de Segurança)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `listing_id` VARCHAR(64) NOT NULL,
  `reporter_name` VARCHAR(150) DEFAULT 'Anónimo',
  `reason` VARCHAR(150) NOT NULL,
  `details` TEXT NOT NULL,
  `status` ENUM('Pendente', 'Resolvido', 'Ignorado', 'Removido') NOT NULL DEFAULT 'Pendente',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 9. MESSAGES TABLE (Chat & Mensagens do Sistema)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `sender_id` VARCHAR(64) NOT NULL,
  `receiver_id` VARCHAR(64) NOT NULL,
  `listing_id` VARCHAR(64) DEFAULT NULL,
  `subject` VARCHAR(255) DEFAULT NULL,
  `content` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 10. LISTING ANALYTICS TABLE (Cliques & Visualizações Reais)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `listing_analytics` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `listing_id` VARCHAR(64) NOT NULL,
  `views_count` INT NOT NULL DEFAULT 0,
  `views_new` INT NOT NULL DEFAULT 0,
  `views_registered` INT NOT NULL DEFAULT 0,
  `clicks_count` INT NOT NULL DEFAULT 0,
  `contact_clicks` INT NOT NULL DEFAULT 0,
  `whatsapp_clicks` INT NOT NULL DEFAULT 0,
  `share_clicks` INT NOT NULL DEFAULT 0,
  `rating` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `last_activity_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_listing_analytics` (`listing_id`),
  FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- SEED INITIAL DATA (CATEGORIAS, ADMINISTRADOR & SLIDES DEFAULT)
-- =============================================================

INSERT INTO `categories` (`slug`, `name`, `icon`, `description`, `sort_order`) VALUES
('eletronica', 'Electrónica', 'Smartphone', 'Smartphones, Laptops, Consolas e Acessórios', 1),
('viaturas', 'Viaturas', 'Car', 'Carros, Motos, Camiões e Peças sobressalentes', 2),
('imoveis', 'Imóveis', 'Home', 'Apartamentos, Casas, Terrenos e Escritórios em Luanda', 3),
('moda', 'Moda', 'Shirt', 'Roupas, Calçado, Relógios e Acessórios', 4),
('moveis', 'Móveis', 'Sofa', 'Mobília para Casa, Escritório e Decoração', 5),
('desporto', 'Desporto', 'Dumbbell', 'Equipamentos de Fitness, Bicicletas e Calçado Desportivo', 6),
('empregos', 'Empregos', 'Briefcase', 'Oportunidades de Trabalho e Serviços Profissionais', 7),
('servicos', 'Serviços', 'Wrench', 'Assistência Técnica, Reparações e Eventos', 8)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Inserir Utilizador Administrador Principal
INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `phone`, `role`, `location`) VALUES
('admin-1', 'Administrador Aqkianda', 'elizangelomanuel@gmail.com', '$2b$10$e8Tj4R1y.L5H13/v6L7Jae2y1r0wG0oO/N/1m8Q9W', '923 000 000', 'admin', 'Luanda, Angola')
ON DUPLICATE KEY UPDATE `role` = 'admin';

-- Inserir Slides Banners Iniciais
INSERT INTO `banners` (`id`, `title`, `subtitle`, `image_url`, `link_url`, `button_text`, `is_active`) VALUES
('b1', 'Grande Inauguração Aqkianda', 'A maior plataforma de negócios em Angola chegou! Descontos especiais de parceiros.', 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1920&q=80', '/explorar', 'Explorar Ofertas', 1),
('b2', 'Campanha Cacimbo Tech', 'Smartphones, Laptops e Acessórios com até 30% de desconto real.', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1920&q=80', '/explorar?cat=eletronica', 'Ver Tecnologia', 1),
('b3', 'Automóveis & Imóveis', 'Encontre os melhores carros e casas de Luanda às melhores condições.', 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=80', '/explorar?cat=viaturas', 'Ver Imóveis', 1)
ON DUPLICATE KEY UPDATE `is_active` = 1;

-- -------------------------------------------------------------
-- 11. PLATFORM TRAFFIC ANALYTICS TABLE (Métricas de Crescimento e Tráfego Geral)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `platform_traffic_analytics` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `traffic_date` DATE NOT NULL UNIQUE,
  `views_total` INT NOT NULL DEFAULT 0,
  `views_new` INT NOT NULL DEFAULT 0,
  `views_registered` INT NOT NULL DEFAULT 0,
  `shares_count` INT NOT NULL DEFAULT 0,
  `signups_count` INT NOT NULL DEFAULT 0,
  `ref_direct` INT NOT NULL DEFAULT 0,
  `ref_search` INT NOT NULL DEFAULT 0,
  `ref_share_link` INT NOT NULL DEFAULT 0,
  `ref_whatsapp` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

