export const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;

/** 要素を作る小さなヘルパー。文字列は textContent として入るので HTML は解釈されない。 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'className') node.className = v;
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `エラーが発生しました (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

export function describeError(err) {
  if (!err.details || typeof err.details !== 'object') return err.message;
  const lines = Object.values(err.details).map((d) =>
    typeof d === 'string' ? d : d?.name ? `${d.name}: 残り ${d.available} 点` : JSON.stringify(d),
  );
  return [err.message, ...lines].join(' / ');
}
