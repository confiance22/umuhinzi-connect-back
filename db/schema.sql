-- Umuhinzi Connect — PostgreSQL schema
-- Run with: psql -U postgres -d umuhinzi_connect -f db/schema.sql

-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  email         VARCHAR(150) UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL CHECK (role IN ('farmer','buyer','admin')),
  district      VARCHAR(60),
  sector        VARCHAR(60),
  reset_otp_hash    TEXT,
  reset_otp_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE harvests (
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

CREATE TABLE buyer_requests (
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

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  harvest_id  UUID REFERENCES harvests(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_harvests_crop      ON harvests(crop_name);
CREATE INDEX idx_harvests_district  ON harvests(district);
CREATE INDEX idx_harvests_farmer    ON harvests(farmer_id);
CREATE INDEX idx_harvests_status    ON harvests(status);
CREATE INDEX idx_requests_crop      ON buyer_requests(crop_name);
CREATE INDEX idx_messages_receiver  ON messages(receiver_id);
