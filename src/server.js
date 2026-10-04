import { createApp } from './app.js';
import { openDatabase } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DATABASE_PATH ?? './data/candle.db';
const adminToken = process.env.ADMIN_TOKEN;

if (!adminToken) {
  console.warn('ADMIN_TOKEN が未設定のため、管理 API は使用できません。');
}

const db = openDatabase(dbPath);
createApp({ db, adminToken }).listen(port, () => {
  console.log(`http://localhost:${port} で起動しました（管理画面: /admin/）`);
});
