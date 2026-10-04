import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  scent            TEXT    NOT NULL DEFAULT '',
  burn_time_hours  INTEGER,
  price            INTEGER NOT NULL CHECK (price >= 0),        -- 税込価格（円）
  stock            INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url        TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number           TEXT    NOT NULL UNIQUE,
  status                 TEXT    NOT NULL DEFAULT 'pending',
  -- 注文者（現状は個人購入のみ。法人対応時は customer_type / company_name を使う）
  customer_type          TEXT    NOT NULL DEFAULT 'individual',
  customer_name          TEXT    NOT NULL,
  customer_email         TEXT    NOT NULL,
  customer_phone         TEXT    NOT NULL DEFAULT '',
  company_name           TEXT,
  -- お届け先（ギフトなので注文者と別になることが多い）
  recipient_name         TEXT    NOT NULL,
  recipient_postal_code  TEXT    NOT NULL,
  recipient_address      TEXT    NOT NULL,
  recipient_phone        TEXT    NOT NULL DEFAULT '',
  -- ギフトオプション
  gift_wrapping          INTEGER NOT NULL DEFAULT 0,
  gift_message           TEXT    NOT NULL DEFAULT '',
  -- 金額（円）
  subtotal               INTEGER NOT NULL,
  wrapping_fee           INTEGER NOT NULL DEFAULT 0,
  shipping_fee           INTEGER NOT NULL DEFAULT 0,
  total                  INTEGER NOT NULL,
  admin_note             TEXT    NOT NULL DEFAULT '',
  created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  product_name  TEXT    NOT NULL,   -- 注文時点の商品名
  unit_price    INTEGER NOT NULL,   -- 注文時点の単価
  quantity      INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`;

/**
 * SQLite データベースを開き、スキーマを適用する。
 * @param {string} path ファイルパス、または ':memory:'
 */
export function openDatabase(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** fn をトランザクション内で実行する。例外時はロールバックする。 */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
