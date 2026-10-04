import { openDatabase } from './db.js';
import { createCatalogService } from './services/catalog.js';

const SAMPLE_PRODUCTS = [
  { name: 'ラベンダー ソイキャンドル', scent: 'ラベンダー', burn_time_hours: 40, price: 2800, stock: 30,
    description: '天然ソイワックスとラベンダー精油で仕上げた、やすらぎの時間のためのキャンドル。' },
  { name: 'シトラス ガラスジャーキャンドル', scent: 'ベルガモット・オレンジ', burn_time_hours: 35, price: 3200, stock: 20,
    description: '爽やかな柑橘の香り。ガラスジャーは使用後に小物入れとしても使えます。' },
  { name: 'ローズ ギフトボックス（3個入り）', scent: 'ローズ・ゼラニウム', burn_time_hours: 15, price: 4800, stock: 12,
    description: '小ぶりなキャンドル 3 個をギフトボックスに詰め合わせました。記念日の贈り物に。' },
  { name: '無香料 ピラーキャンドル', scent: '無香料', burn_time_hours: 60, price: 2200, stock: 50,
    description: '香りが苦手な方や食卓にも。ゆっくり長く灯せるピラータイプ。' },
];

const db = openDatabase(process.env.DATABASE_PATH ?? './data/candle.db');
const catalog = createCatalogService(db);
if (catalog.listAll().length > 0) {
  console.log('商品が既に登録されているため、サンプルデータの投入をスキップしました。');
} else {
  for (const product of SAMPLE_PRODUCTS) catalog.create(product);
  console.log(`サンプル商品を ${SAMPLE_PRODUCTS.length} 件登録しました。`);
}
