import { api, describeError, el, yen } from './common.js';

const state = { products: [], cart: new Map(), pricing: null };
const $ = (id) => document.getElementById(id);

function renderProducts() {
  $('products').replaceChildren(
    ...state.products.map((p) =>
      el('div', { className: 'card' },
        el('h3', {}, p.name),
        el('div', { className: 'muted' }, [p.scent, p.burn_time_hours ? `燃焼時間 約${p.burn_time_hours}時間` : null].filter(Boolean).join(' / ')),
        el('p', {}, p.description),
        el('div', { className: 'row' },
          el('span', { className: 'price' }, yen(p.price)),
          p.stock > 0
            ? el('button', { onclick: () => addToCart(p.id) }, 'カートに入れる')
            : el('span', { className: 'muted' }, '在庫切れ'),
        ),
      ),
    ),
  );
}

function addToCart(productId) {
  const product = state.products.find((p) => p.id === productId);
  const next = (state.cart.get(productId) ?? 0) + 1;
  if (next > product.stock) return;
  state.cart.set(productId, next);
  renderCart();
}

function setQuantity(productId, quantity) {
  if (quantity <= 0) state.cart.delete(productId);
  else state.cart.set(productId, quantity);
  renderCart();
}

function calcTotals() {
  let subtotal = 0;
  for (const [id, qty] of state.cart) subtotal += state.products.find((p) => p.id === id).price * qty;
  const { wrappingFee, shippingFee, freeShippingThreshold } = state.pricing;
  const wrapping = $('gift-wrapping').checked ? wrappingFee : 0;
  const shipping = subtotal >= freeShippingThreshold ? 0 : shippingFee;
  return { subtotal, wrapping, shipping, total: subtotal + wrapping + shipping };
}

function renderCart() {
  const empty = state.cart.size === 0;
  $('cart-empty').classList.toggle('hidden', !empty);
  $('cart-table').classList.toggle('hidden', empty);
  $('submit').disabled = empty;
  $('cart-body').replaceChildren(
    ...[...state.cart].map(([id, qty]) => {
      const p = state.products.find((x) => x.id === id);
      return el('tr', {},
        el('td', {}, p.name),
        el('td', {}, el('input', {
          type: 'number', min: 0, max: p.stock, value: qty, style: 'width:4.5em',
          onchange: (e) => setQuantity(id, Math.min(p.stock, Number.parseInt(e.target.value, 10) || 0)),
        })),
        el('td', {}, yen(p.price * qty)),
      );
    }),
  );
  if (empty) return $('totals').replaceChildren();
  const t = calcTotals();
  $('totals').replaceChildren(
    `小計 ${yen(t.subtotal)} / ラッピング ${yen(t.wrapping)} / 送料 ${yen(t.shipping)}`,
    el('br'),
    el('strong', {}, `合計 ${yen(t.total)}`),
    el('div', { className: 'muted' }, `${yen(state.pricing.freeShippingThreshold)} 以上のご注文で送料無料`),
  );
}

async function submitOrder(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = Object.fromEntries([...form].filter(([k]) => k !== 'gift_wrapping'));
  body.gift_wrapping = $('gift-wrapping').checked;
  body.items = [...state.cart].map(([product_id, quantity]) => ({ product_id, quantity }));
  $('form-error').textContent = '';
  $('submit').disabled = true;
  try {
    const order = await api('/api/orders', { method: 'POST', body });
    state.cart.clear();
    e.target.classList.add('hidden');
    $('order-done').classList.remove('hidden');
    $('order-done').replaceChildren(
      el('h3', { className: 'ok' }, 'ご注文ありがとうございました'),
      el('p', {}, '注文番号: ', el('strong', {}, order.order_number)),
      el('p', {}, `合計 ${yen(order.total)}`),
      el('p', { className: 'muted' }, '注文番号とメールアドレスで、ページ下部から注文状況を確認できます。'),
    );
    await loadProducts();
  } catch (err) {
    $('form-error').textContent = describeError(err);
    $('submit').disabled = false;
  }
}

async function lookupOrder(e) {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const out = $('lookup-result');
  try {
    const o = await api('/api/orders/lookup', { method: 'POST', body: form });
    out.replaceChildren(
      el('p', {}, '状態: ', el('span', { className: 'badge' }, o.status_label)),
      el('ul', {}, ...o.items.map((i) => el('li', {}, `${i.product_name} × ${i.quantity}`))),
      el('p', {}, `お届け先: ${o.recipient_name} 様 / 合計 ${yen(o.total)}`),
    );
  } catch (err) {
    out.replaceChildren(el('p', { className: 'error' }, err.message));
  }
}

async function loadProducts() {
  state.products = (await api('/api/products')).products;
  renderProducts();
  renderCart();
}

$('same-as-customer').addEventListener('change', (e) => {
  const form = $('order-form');
  if (!e.target.checked) return;
  form.recipient_name.value = form.customer_name.value;
  form.recipient_phone.value = form.customer_phone.value;
});
$('gift-wrapping').addEventListener('change', renderCart);
$('order-form').addEventListener('submit', submitOrder);
$('lookup-form').addEventListener('submit', lookupOrder);

state.pricing = (await api('/api/config')).pricing;
$('wrapping-fee').textContent = `+${yen(state.pricing.wrappingFee)}`;
await loadProducts();
