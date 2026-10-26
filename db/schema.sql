-- Umuhinzi Connect — PostgreSQL schema
-- Safe to run repeatedly: every statement is idempotent.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core account table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         VARCHAR(120) NOT NULL,
  phone             VARCHAR(20) UNIQUE NOT NULL,
  email             VARCHAR(150) UNIQUE,
  password_hash     TEXT NOT NULL,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('farmer','buyer','super_admin')),
  province          VARCHAR(60),
  district          VARCHAR(60),
  sector            VARCHAR(60),
  cell              VARCHAR(60),
  village           VARCHAR(60),
  village_code      VARCHAR(20),
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  account_non_locked BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  reset_otp_hash    TEXT,
  reset_otp_expires TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing databases were created with a narrower role column and no status
-- columns; bring them in line without dropping any data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS province VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cell VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS village VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS village_code VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_non_locked BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'super_admin' WHERE role = 'admin';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('farmer','buyer','super_admin'));

-- Roles and permissions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(30) UNIQUE NOT NULL,
  name        VARCHAR(80) NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(80) UNIQUE NOT NULL,
  label       VARCHAR(120) NOT NULL,
  group_name  VARCHAR(60) NOT NULL DEFAULT 'General',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Marketplace tables -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS harvests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name       VARCHAR(80) NOT NULL,
  quantity_kg     NUMERIC(10,2) NOT NULL CHECK (quantity_kg > 0),
  price_per_kg    NUMERIC(10,2) NOT NULL CHECK (price_per_kg > 0),
  harvest_date    DATE NOT NULL,
  district        VARCHAR(60) NOT NULL,
  sector          VARCHAR(60),
  description     TEXT,
  image_url       TEXT,
  status          VARCHAR(15) DEFAULT 'active' CHECK (status IN ('active','sold','expired','hidden')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buyer_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name     VARCHAR(80) NOT NULL,
  quantity_kg   NUMERIC(10,2) NOT NULL CHECK (quantity_kg > 0),
  max_price_kg  NUMERIC(10,2),
  district      VARCHAR(60),
  needed_by     DATE,
  notes         TEXT,
  status        VARCHAR(15) DEFAULT 'open' CHECK (status IN ('open','closed','fulfilled')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  harvest_id  UUID REFERENCES harvests(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvests_crop      ON harvests(crop_name);
CREATE INDEX IF NOT EXISTS idx_harvests_district  ON harvests(district);
CREATE INDEX IF NOT EXISTS idx_harvests_farmer    ON harvests(farmer_id);
CREATE INDEX IF NOT EXISTS idx_harvests_status    ON harvests(status);
CREATE INDEX IF NOT EXISTS idx_requests_crop      ON buyer_requests(crop_name);
CREATE INDEX IF NOT EXISTS idx_messages_receiver  ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_users_role         ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_enabled      ON users(enabled);
CREATE INDEX IF NOT EXISTS idx_users_village_code ON users(village_code);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- Add optional harvest classification columns
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS category VARCHAR(40) DEFAULT 'vegetables';
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS variety VARCHAR(80);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS lot VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_harvests_category ON harvests(category);

-- Market prices table ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_name       VARCHAR(80) NOT NULL,
  crop_key        VARCHAR(100),
  market          VARCHAR(100) NOT NULL,
  district        VARCHAR(60) NOT NULL,
  unit            VARCHAR(20) NOT NULL DEFAULT 'kg',
  price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  previous_price  NUMERIC(10,2),
  change_percent  NUMERIC(5,2) DEFAULT 0,
  series          JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_prices_crop     ON market_prices(crop_name);
CREATE INDEX IF NOT EXISTS idx_market_prices_district ON market_prices(district);
CREATE INDEX IF NOT EXISTS idx_market_prices_market   ON market_prices(market);

-- Dynamic pages content table --------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(60) UNIQUE NOT NULL,
  title       VARCHAR(150) NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta        JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);

