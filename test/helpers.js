import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

export const ADMIN_TOKEN = 'test-admin-token';

/** メモリ DB でアプリを起動し、fetch ベースの小さなクライアントを返す。 */
export async function startTestServer() {
  const db = openDatabase(':memory:');
  const server = createApp({ db, adminToken: ADMIN_TOKEN }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, admin = false, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const auth = token ?? (admin ? ADMIN_TOKEN : undefined);
    if (auth) headers.authorization = `Bearer ${auth}`;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return {
    db,
    request,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const validOrder = (items) => ({
  customer_name: '山田 花子',
  customer_email: 'hanako@example.com',
  customer_phone: '090-1234-5678',
  recipient_name: '佐藤 太郎',
  recipient_postal_code: '150-0001',
  recipient_address: '東京都渋谷区神宮前1-2-3',
  gift_wrapping: true,
  gift_message: 'お誕生日おめでとう！',
  items,
});
