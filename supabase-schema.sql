-- ============================================================
-- MISE EN PLACE — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    name TEXT PRIMARY KEY,
    emoji TEXT NOT NULL DEFAULT '🍽️',
    order_index INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg',
    category TEXT NOT NULL DEFAULT 'Général' REFERENCES categories(name) ON UPDATE CASCADE ON DELETE SET DEFAULT,
    emoji TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- LOCATIONS (replaces selling_points — stores + kitchen)
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    pin CHAR(4) NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'store' CHECK (role IN ('kitchen', 'store')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS productions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity REAL NOT NULL,
    notes TEXT,
    produced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productions_item ON productions(item_id);
CREATE INDEX IF NOT EXISTS idx_productions_date ON productions(produced_at);

-- ============================================================
-- DISPATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    quantity REAL NOT NULL,
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatches_item ON dispatches(item_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_location ON dispatches(location_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(dispatched_at);

-- ============================================================
-- ORDERS (stores request mise en place)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity_requested REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dispatched', 'cancelled')),
    order_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(location_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================
-- STOCK DECLARATIONS (end-of-shift remaining stock from stores)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_declarations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity_remaining REAL NOT NULL,
    shift_date DATE NOT NULL,
    declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    production_id UUID REFERENCES productions(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL DEFAULT 'scan' CHECK (entry_type IN ('scan', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_stock_decl_location ON stock_declarations(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_decl_date ON stock_declarations(shift_date);

-- ============================================================
-- SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default categories
INSERT INTO categories (name, emoji, order_index) VALUES
  ('Légumes', '🥗', 0),
  ('Viandes', '🥩', 1),
  ('Sauces', '🥫', 2),
  ('Charcuterie/Fromage', '🧀', 3),
  ('Accompagnements', '🍚', 4)
ON CONFLICT (name) DO NOTHING;

-- Default locations
INSERT INTO locations (name, pin, role) VALUES
  ('Cuisine Centrale', '0000', 'kitchen'),
  ('BOCADILLO HOUSE - KETTANI', '1234', 'store')
ON CONFLICT (pin) DO NOTHING;

-- ============================================================
-- ENABLE REALTIME for orders and stock_declarations
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_declarations;

-- ============================================================
-- BARCODE LOOKUP FUNCTION
-- PostgreSQL function to find a production by barcode prefix
-- Barcode format: "{item_id_first_8_chars}-{production_id_first_8_chars}"
-- ============================================================
CREATE OR REPLACE FUNCTION lookup_barcode(item_prefix TEXT, prod_prefix TEXT)
RETURNS TABLE (
    id UUID,
    item_id UUID,
    quantity REAL,
    notes TEXT,
    produced_at TIMESTAMPTZ,
    item_name TEXT,
    item_unit TEXT,
    item_category TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.item_id,
        p.quantity,
        p.notes,
        p.produced_at,
        i.name AS item_name,
        i.unit AS item_unit,
        i.category AS item_category
    FROM productions p
    JOIN items i ON p.item_id = i.id
    WHERE LEFT(p.id::text, 8) = prod_prefix
      AND LEFT(i.id::text, 8) = item_prefix
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
