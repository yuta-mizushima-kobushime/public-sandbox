import { notFound } from '../errors.js';
import { Validator } from '../validation.js';

function toProduct(row) {
  if (!row) return row;
  return { ...row, is_active: row.is_active === 1 };
}

function readProductInput(input, { partial }) {
  const v = new Validator(input);
  const has = (key) => !partial || key in v.input;
  const fields = {};
  if (has('name')) fields.name = v.string('name', { required: true, max: 100 });
  if (has('description')) fields.description = v.string('description', { max: 2000 });
  if (has('scent')) fields.scent = v.string('scent', { max: 100 });
  if (has('burn_time_hours')) fields.burn_time_hours = v.integer('burn_time_hours', { min: 0, max: 1000 }) ?? null;
  if (has('price')) fields.price = v.integer('price', { required: true, min: 0, max: 10_000_000 });
  if (has('stock')) fields.stock = v.integer('stock', { required: !partial, min: 0, max: 1_000_000 }) ?? 0;
  if (has('image_url')) fields.image_url = v.string('image_url', { max: 2000 }) || null;
  if (has('is_active')) fields.is_active = v.boolean('is_active', { defaultValue: true }) ? 1 : 0;
  v.assertValid();
  return fields;
}

export function createCatalogService(db) {
  return {
    /** 公開中の商品一覧（購入者向け） */
    listActive() {
      return db
        .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY id')
        .all()
        .map(toProduct);
    },

    /** 全商品一覧（管理者向け） */
    listAll() {
      return db.prepare('SELECT * FROM products ORDER BY id').all().map(toProduct);
    },

    get(id, { activeOnly = false } = {}) {
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!row || (activeOnly && row.is_active !== 1)) throw notFound('商品が見つかりません');
      return toProduct(row);
    },

    create(input) {
      const f = readProductInput(input, { partial: false });
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO products (name, description, scent, burn_time_hours, price, stock, image_url, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(f.name, f.description, f.scent, f.burn_time_hours, f.price, f.stock, f.image_url, f.is_active ?? 1);
      return this.get(Number(lastInsertRowid));
    },

    update(id, input) {
      this.get(id);
      const f = readProductInput(input, { partial: true });
      const keys = Object.keys(f);
      if (keys.length > 0) {
        const sets = keys.map((k) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE products SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
          ...keys.map((k) => f[k]),
          id,
        );
      }
      return this.get(id);
    },
  };
}
