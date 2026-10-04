import { randomBytes } from 'node:crypto';
import { transaction } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { calculateTotals, PRICING } from '../pricing.js';
import { EMAIL_PATTERN, PHONE_PATTERN, POSTAL_CODE_PATTERN, Validator } from '../validation.js';

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export const STATUS_LABELS = {
  pending: '受付',
  confirmed: '確定',
  shipped: '発送済み',
  delivered: '配達完了',
  cancelled: 'キャンセル',
};

// 許可するステータス遷移
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const MAX_LINE_QUANTITY = 99;

function generateOrderNumber() {
  // 例: C20261004-7F3A9C
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `C${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function readOrderInput(input) {
  const v = new Validator(input);
  const customer = {
    name: v.string('customer_name', { required: true, max: 100 }),
    email: v.string('customer_email', { required: true, max: 254, pattern: EMAIL_PATTERN, message: 'メールアドレスの形式が正しくありません' }),
    phone: v.string('customer_phone', { max: 20, pattern: PHONE_PATTERN, message: '電話番号の形式が正しくありません' }),
  };
  const recipient = {
    name: v.string('recipient_name', { required: true, max: 100 }),
    postalCode: v.string('recipient_postal_code', { required: true, pattern: POSTAL_CODE_PATTERN, message: '郵便番号は 123-4567 の形式で入力してください' }),
    address: v.string('recipient_address', { required: true, max: 300 }),
    phone: v.string('recipient_phone', { max: 20, pattern: PHONE_PATTERN, message: '電話番号の形式が正しくありません' }),
  };
  const gift = {
    wrapping: v.boolean('gift_wrapping'),
    message: v.string('gift_message', { max: 200 }),
  };

  const rawItems = v.input.items;
  const items = new Map(); // product_id -> quantity（同じ商品は合算）
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    v.addError('items', '商品を 1 点以上選択してください');
  } else {
    rawItems.forEach((item, i) => {
      const productId = item?.product_id;
      const quantity = item?.quantity;
      if (!Number.isInteger(productId) || productId <= 0) {
        v.addError(`items[${i}].product_id`, '商品 ID が正しくありません');
      } else if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
        v.addError(`items[${i}].quantity`, `数量は 1〜${MAX_LINE_QUANTITY} で指定してください`);
      } else {
        items.set(productId, (items.get(productId) ?? 0) + quantity);
      }
    });
  }
  v.assertValid();
  return { customer, recipient, gift, items };
}

export function createOrderService(db, { pricing = PRICING } = {}) {
  const getOrderRow = db.prepare('SELECT * FROM orders WHERE id = ?');
  const getOrderRowByNumber = db.prepare('SELECT * FROM orders WHERE order_number = ?');
  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');

  function hydrate(row) {
    return {
      ...row,
      gift_wrapping: row.gift_wrapping === 1,
      status_label: STATUS_LABELS[row.status],
      items: getItems.all(row.id),
    };
  }

  function restock(orderId) {
    const stmt = db.prepare('UPDATE products SET stock = stock + ?, updated_at = datetime(\'now\') WHERE id = ?');
    for (const item of getItems.all(orderId)) stmt.run(item.quantity, item.product_id);
  }

  return {
    /** 注文を作成する。在庫を引き当て、金額はサーバー側で計算する。 */
    create(input) {
      const { customer, recipient, gift, items } = readOrderInput(input);

      return transaction(db, () => {
        const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
        const lines = [];
        const shortages = {};
        for (const [productId, quantity] of items) {
          const product = getProduct.get(productId);
          if (!product || product.is_active !== 1) throw badRequest('購入できない商品が含まれています', { product_id: productId });
          if (product.stock < quantity) shortages[productId] = { name: product.name, requested: quantity, available: product.stock };
          lines.push({ product, quantity });
        }
        if (Object.keys(shortages).length > 0) throw conflict('在庫が不足しています', shortages);

        const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
        const totals = calculateTotals(subtotal, { giftWrapping: gift.wrapping }, pricing);

        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO orders (
               order_number, customer_name, customer_email, customer_phone,
               recipient_name, recipient_postal_code, recipient_address, recipient_phone,
               gift_wrapping, gift_message, subtotal, wrapping_fee, shipping_fee, total
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            generateOrderNumber(),
            customer.name, customer.email, customer.phone,
            recipient.name, recipient.postalCode, recipient.address, recipient.phone,
            gift.wrapping ? 1 : 0, gift.message,
            totals.subtotal, totals.wrappingFee, totals.shippingFee, totals.total,
          );
        const orderId = Number(lastInsertRowid);

        const insertItem = db.prepare(
          'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)',
        );
        const decrement = db.prepare(
          'UPDATE products SET stock = stock - ?, updated_at = datetime(\'now\') WHERE id = ? AND stock >= ?',
        );
        for (const { product, quantity } of lines) {
          insertItem.run(orderId, product.id, product.name, product.price, quantity);
          if (decrement.run(quantity, product.id, quantity).changes !== 1) throw conflict('在庫が不足しています');
        }
        return hydrate(getOrderRow.get(orderId));
      });
    },

    get(id) {
      const row = getOrderRow.get(id);
      if (!row) throw notFound('注文が見つかりません');
      return hydrate(row);
    },

    /** 購入者向けの注文照会。注文番号とメールアドレスの両方が一致した場合のみ返す。 */
    lookup(orderNumber, email) {
      const row = typeof orderNumber === 'string' ? getOrderRowByNumber.get(orderNumber.trim()) : undefined;
      if (!row || typeof email !== 'string' || row.customer_email.toLowerCase() !== email.trim().toLowerCase()) {
        throw notFound('注文が見つかりません');
      }
      const { admin_note, ...order } = hydrate(row);
      return order;
    },

    list({ status, limit = 50, offset = 0 } = {}) {
      if (status !== undefined && !ORDER_STATUSES.includes(status)) throw badRequest('status の値が正しくありません');
      const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
      const off = Math.max(Number.parseInt(offset, 10) || 0, 0);
      const where = status ? 'WHERE status = ?' : '';
      const params = status ? [status] : [];
      const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, lim, off);
      const { count } = db.prepare(`SELECT COUNT(*) AS count FROM orders ${where}`).get(...params);
      return { orders: rows.map(hydrate), total: count, limit: lim, offset: off };
    },

    /** ステータスを変更する。キャンセル時は在庫を戻す。 */
    updateStatus(id, input) {
      const v = new Validator(input);
      const status = v.string('status', { required: true });
      const adminNote = 'admin_note' in v.input ? v.string('admin_note', { max: 2000 }) : undefined;
      if (status && !ORDER_STATUSES.includes(status)) v.addError('status', 'ステータスの値が正しくありません');
      v.assertValid();

      return transaction(db, () => {
        const order = getOrderRow.get(id);
        if (!order) throw notFound('注文が見つかりません');
        if (order.status !== status) {
          if (!TRANSITIONS[order.status].includes(status)) {
            throw conflict(`「${STATUS_LABELS[order.status]}」から「${STATUS_LABELS[status]}」には変更できません`);
          }
          if (status === 'cancelled') restock(id);
        }
        db.prepare(
          `UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = datetime('now') WHERE id = ?`,
        ).run(status, adminNote ?? null, id);
        return hydrate(getOrderRow.get(id));
      });
    },
  };
}
