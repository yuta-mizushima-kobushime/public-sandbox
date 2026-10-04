import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AppError, notFound } from './errors.js';
import { PRICING } from './pricing.js';
import { createCatalogService } from './services/catalog.js';
import { createOrderService, ORDER_STATUSES, STATUS_LABELS } from './services/orders.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

function requireAdmin(adminToken) {
  const expected = Buffer.from(adminToken ?? '');
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return next(new AppError(401, '管理者として認証されていません'));
    }
    next();
  };
}

/**
 * Express アプリを組み立てる。
 * @param {{ db: import('node:sqlite').DatabaseSync, adminToken: string }} options
 */
export function createApp({ db, adminToken }) {
  const catalog = createCatalogService(db);
  const orders = createOrderService(db);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // ---- 購入者向け API ----
  const shop = express.Router();
  shop.get('/config', (_req, res) => res.json({ pricing: PRICING }));
  shop.get('/products', (_req, res) => res.json({ products: catalog.listActive() }));
  shop.get('/products/:id', (req, res) => res.json(catalog.get(parseId(req.params.id), { activeOnly: true })));
  shop.post('/orders', (req, res) => res.status(201).json(orders.create(req.body)));
  shop.post('/orders/lookup', (req, res) => res.json(orders.lookup(req.body?.order_number, req.body?.email)));
  app.use('/api', shop);

  // ---- 管理者向け API ----
  const admin = express.Router();
  admin.use(requireAdmin(adminToken));
  admin.get('/products', (_req, res) => res.json({ products: catalog.listAll() }));
  admin.post('/products', (req, res) => res.status(201).json(catalog.create(req.body)));
  admin.patch('/products/:id', (req, res) => res.json(catalog.update(parseId(req.params.id), req.body)));
  admin.get('/orders', (req, res) =>
    res.json({ ...orders.list(req.query), statuses: ORDER_STATUSES, status_labels: STATUS_LABELS }),
  );
  admin.get('/orders/:id', (req, res) => res.json(orders.get(parseId(req.params.id))));
  admin.patch('/orders/:id/status', (req, res) => res.json(orders.updateStatus(parseId(req.params.id), req.body)));
  app.use('/api/admin', admin);

  app.use('/api', (_req, _res, next) => next(notFound('API が見つかりません')));

  // ---- 画面 ----
  app.use(express.static(PUBLIC_DIR));

  // ---- エラーハンドリング ----
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON の形式が正しくありません' });
    }
    console.error(err);
    res.status(500).json({ error: 'サーバーでエラーが発生しました' });
  });

  return app;
}
