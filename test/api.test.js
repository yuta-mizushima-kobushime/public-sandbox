import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { startTestServer, validOrder } from './helpers.js';

let t;
let lavender;
let rose;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());

beforeEach(async () => {
  t.db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;');
  lavender = (await t.request('POST', '/api/admin/products', {
    admin: true,
    body: { name: 'ラベンダー', price: 2800, stock: 5, scent: 'ラベンダー' },
  })).body;
  rose = (await t.request('POST', '/api/admin/products', {
    admin: true,
    body: { name: 'ローズ', price: 4800, stock: 2 },
  })).body;
});

describe('商品一覧', () => {
  test('公開中の商品だけが返る', async () => {
    await t.request('PATCH', `/api/admin/products/${rose.id}`, { admin: true, body: { is_active: false } });
    const res = await t.request('GET', '/api/products');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.products.map((p) => p.name), ['ラベンダー']);
  });

  test('非公開の商品詳細は 404', async () => {
    await t.request('PATCH', `/api/admin/products/${rose.id}`, { admin: true, body: { is_active: false } });
    assert.equal((await t.request('GET', `/api/products/${rose.id}`)).status, 404);
  });
});

describe('注文作成', () => {
  test('金額をサーバー側で計算し、在庫を減らす', async () => {
    const res = await t.request('POST', '/api/orders', {
      body: validOrder([{ product_id: lavender.id, quantity: 2 }]),
    });
    assert.equal(res.status, 201);
    const order = res.body;
    assert.match(order.order_number, /^C\d{8}-[0-9A-F]{6}$/);
    assert.equal(order.status, 'pending');
    assert.equal(order.subtotal, 5600);
    assert.equal(order.wrapping_fee, 330);
    assert.equal(order.shipping_fee, 0); // 5,500 円以上で送料無料
    assert.equal(order.total, 5930);
    assert.equal(order.items[0].product_name, 'ラベンダー');
    assert.equal(order.items[0].unit_price, 2800);

    const product = (await t.request('GET', `/api/products/${lavender.id}`)).body;
    assert.equal(product.stock, 3);
  });

  test('送料無料ライン未満なら送料がかかる', async () => {
    const res = await t.request('POST', '/api/orders', {
      body: { ...validOrder([{ product_id: lavender.id, quantity: 1 }]), gift_wrapping: false },
    });
    assert.equal(res.body.shipping_fee, 880);
    assert.equal(res.body.total, 2800 + 880);
  });

  test('同じ商品の明細は合算される', async () => {
    const res = await t.request('POST', '/api/orders', {
      body: validOrder([{ product_id: rose.id, quantity: 1 }, { product_id: rose.id, quantity: 1 }]),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].quantity, 2);
  });

  test('在庫不足なら 409 で、在庫は変わらない', async () => {
    const res = await t.request('POST', '/api/orders', {
      body: validOrder([{ product_id: lavender.id, quantity: 1 }, { product_id: rose.id, quantity: 3 }]),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.details[rose.id].available, 2);
    const products = (await t.request('GET', '/api/products')).body.products;
    assert.deepEqual(products.map((p) => p.stock), [5, 2]);
  });

  test('入力に誤りがあれば 400 と項目ごとのエラー', async () => {
    const res = await t.request('POST', '/api/orders', {
      body: { ...validOrder([]), customer_email: 'invalid', recipient_postal_code: '1234' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.customer_email);
    assert.ok(res.body.details.recipient_postal_code);
    assert.ok(res.body.details.items);
  });

  test('非公開の商品は注文できない', async () => {
    await t.request('PATCH', `/api/admin/products/${rose.id}`, { admin: true, body: { is_active: false } });
    const res = await t.request('POST', '/api/orders', { body: validOrder([{ product_id: rose.id, quantity: 1 }]) });
    assert.equal(res.status, 400);
  });

  test('壊れた JSON は 400', async () => {
    const res = await t.request('POST', '/api/orders', { body: '{' });
    assert.equal(res.status, 400);
  });
});

describe('注文照会', () => {
  test('注文番号とメールアドレスが一致すれば照会できる', async () => {
    const order = (await t.request('POST', '/api/orders', {
      body: validOrder([{ product_id: lavender.id, quantity: 1 }]),
    })).body;
    const ok = await t.request('POST', '/api/orders/lookup', {
      body: { order_number: order.order_number, email: 'HANAKO@example.com' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status_label, '受付');
    assert.equal(ok.body.admin_note, undefined);

    const ng = await t.request('POST', '/api/orders/lookup', {
      body: { order_number: order.order_number, email: 'other@example.com' },
    });
    assert.equal(ng.status, 404);
  });
});

describe('管理 API', () => {
  test('トークンがなければ 401', async () => {
    assert.equal((await t.request('GET', '/api/admin/orders')).status, 401);
    assert.equal((await t.request('GET', '/api/admin/orders', { token: 'wrong' })).status, 401);
  });

  test('注文一覧をステータスで絞り込める', async () => {
    const a = (await t.request('POST', '/api/orders', { body: validOrder([{ product_id: lavender.id, quantity: 1 }]) })).body;
    await t.request('POST', '/api/orders', { body: validOrder([{ product_id: lavender.id, quantity: 1 }]) });
    await t.request('PATCH', `/api/admin/orders/${a.id}/status`, { admin: true, body: { status: 'confirmed' } });

    const all = await t.request('GET', '/api/admin/orders', { admin: true });
    assert.equal(all.body.total, 2);
    const confirmed = await t.request('GET', '/api/admin/orders?status=confirmed', { admin: true });
    assert.deepEqual(confirmed.body.orders.map((o) => o.id), [a.id]);
    assert.equal((await t.request('GET', '/api/admin/orders?status=bogus', { admin: true })).status, 400);
  });

  test('ステータスは決められた順にだけ進められる', async () => {
    const order = (await t.request('POST', '/api/orders', { body: validOrder([{ product_id: lavender.id, quantity: 1 }]) })).body;
    const path = `/api/admin/orders/${order.id}/status`;

    assert.equal((await t.request('PATCH', path, { admin: true, body: { status: 'shipped' } })).status, 409);
    for (const status of ['confirmed', 'shipped', 'delivered']) {
      const res = await t.request('PATCH', path, { admin: true, body: { status } });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, status);
    }
    assert.equal((await t.request('PATCH', path, { admin: true, body: { status: 'cancelled' } })).status, 409);
  });

  test('キャンセルすると在庫が戻る', async () => {
    const order = (await t.request('POST', '/api/orders', { body: validOrder([{ product_id: rose.id, quantity: 2 }]) })).body;
    assert.equal((await t.request('GET', `/api/products/${rose.id}`)).body.stock, 0);

    const res = await t.request('PATCH', `/api/admin/orders/${order.id}/status`, {
      admin: true,
      body: { status: 'cancelled', admin_note: 'お客様都合' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.admin_note, 'お客様都合');
    assert.equal((await t.request('GET', `/api/products/${rose.id}`)).body.stock, 2);
  });

  test('商品の追加・更新ができ、不正な値は 400', async () => {
    const bad = await t.request('POST', '/api/admin/products', { admin: true, body: { name: '', price: -1 } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.name);
    assert.ok(bad.body.details.price);

    const res = await t.request('PATCH', `/api/admin/products/${lavender.id}`, { admin: true, body: { stock: 10 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.stock, 10);
    assert.equal(res.body.price, 2800);
  });
});
