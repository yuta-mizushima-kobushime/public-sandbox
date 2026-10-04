import { api, describeError, el, yen } from '../common.js';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'candle-admin-token';
let token = sessionStorage.getItem(TOKEN_KEY);
let statusLabels = {};

const adminApi = (path, opts = {}) =>
  api(`/api/admin${path}`, { ...opts, token }).catch((err) => {
    if (err.status === 401) logout();
    throw err;
  });

function nextStatuses(status) {
  return { pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'] }[status] ?? [];
}

async function loadOrders() {
  const status = $('status-filter').value || undefined;
  const data = await adminApi(`/orders${status ? `?status=${status}` : ''}`);
  statusLabels = data.status_labels;
  if ($('status-filter').options.length === 0) {
    $('status-filter').replaceChildren(
      el('option', { value: '' }, 'すべて'),
      ...data.statuses.map((s) => el('option', { value: s }, statusLabels[s])),
    );
  }
  $('order-count').textContent = `${data.total} 件`;
  $('orders-body').replaceChildren(
    ...data.orders.map((o) =>
      el('tr', {},
        el('td', {}, o.order_number),
        el('td', {}, o.created_at),
        el('td', {}, o.customer_name, el('div', { className: 'muted' }, o.customer_email)),
        el('td', {}, `${o.recipient_name} 様`,
          el('div', { className: 'muted' }, `〒${o.recipient_postal_code} ${o.recipient_address}`)),
        el('td', {},
          ...o.items.map((i) => el('div', {}, `${i.product_name} × ${i.quantity}`)),
          o.gift_wrapping ? el('div', { className: 'muted' }, 'ラッピングあり') : null,
          o.gift_message ? el('div', { className: 'muted' }, `メッセージ: ${o.gift_message}`) : null,
        ),
        el('td', {}, yen(o.total)),
        el('td', {},
          el('span', { className: 'badge' }, o.status_label),
          el('div', { className: 'row', style: 'margin-top:6px' },
            ...nextStatuses(o.status).map((s) =>
              el('button', { className: s === 'cancelled' ? 'secondary' : '', onclick: () => changeStatus(o, s) }, statusLabels[s]),
            ),
          ),
        ),
      ),
    ),
  );
}

async function changeStatus(order, status) {
  if (!confirm(`${order.order_number} を「${statusLabels[status]}」に変更しますか？`)) return;
  try {
    await adminApi(`/orders/${order.id}/status`, { method: 'PATCH', body: { status } });
    await loadOrders();
  } catch (err) {
    alert(describeError(err));
  }
}

async function loadProducts() {
  const { products } = await adminApi('/products');
  $('products-body').replaceChildren(
    ...products.map((p) => {
      const price = el('input', { type: 'number', min: 0, value: p.price, style: 'width:7em' });
      const stock = el('input', { type: 'number', min: 0, value: p.stock, style: 'width:5em' });
      const active = el('input', { type: 'checkbox', checked: p.is_active });
      const save = async () => {
        try {
          await adminApi(`/products/${p.id}`, {
            method: 'PATCH',
            body: { price: Number(price.value), stock: Number(stock.value), is_active: active.checked },
          });
          await loadProducts();
        } catch (err) {
          alert(describeError(err));
        }
      };
      return el('tr', {},
        el('td', {}, p.id), el('td', {}, p.name), el('td', {}, price), el('td', {}, stock), el('td', {}, active),
        el('td', {}, el('button', { onclick: save }, '保存')),
      );
    }),
  );
}

async function addProduct(e) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  for (const k of ['price', 'stock', 'burn_time_hours']) body[k] = body[k] === '' ? undefined : Number(body[k]);
  $('product-error').textContent = '';
  try {
    await adminApi('/products', { method: 'POST', body });
    e.target.reset();
    await loadProducts();
  } catch (err) {
    $('product-error').textContent = describeError(err);
  }
}

function showTab(name) {
  $('orders-view').classList.toggle('hidden', name !== 'orders');
  $('products-view').classList.toggle('hidden', name !== 'products');
  return name === 'orders' ? loadOrders() : loadProducts();
}

function logout() {
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  $('dashboard').classList.add('hidden');
  $('login').classList.remove('hidden');
}

async function start() {
  try {
    await showTab('orders');
    $('login').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
  } catch (err) {
    $('login-error').textContent = err.message;
  }
}

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  token = new FormData(e.target).get('token');
  sessionStorage.setItem(TOKEN_KEY, token);
  start();
});
$('logout').addEventListener('click', logout);
$('tab-orders').addEventListener('click', () => showTab('orders'));
$('tab-products').addEventListener('click', () => showTab('products'));
$('status-filter').addEventListener('change', loadOrders);
$('product-form').addEventListener('submit', addProduct);

if (token) start();
