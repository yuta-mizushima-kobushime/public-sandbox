# ギフトキャンドル受発注プラットフォーム

ギフト用キャンドルの注文を受け付け、管理するための Web アプリケーションです。
現在は **単一事業者が個人のお客様に販売する** 最小構成（MVP）です。

## できること

| 画面 | URL | 内容 |
| --- | --- | --- |
| ショップ | `/` | 商品一覧、カート、注文（お届け先・ギフトラッピング・メッセージカード）、注文照会 |
| 管理画面 | `/admin/` | 注文一覧（状態で絞り込み）、状態変更、商品の追加・価格／在庫／公開設定の変更 |

- 金額（小計・ラッピング代・送料）はサーバー側で計算します。料金は `src/pricing.js` で設定します
  （ラッピング 330 円、送料 880 円、5,500 円以上で送料無料）。
- 注文時に在庫を引き当て、キャンセル時に在庫を戻します。
- 注文の状態は `受付 → 確定 → 発送済み → 配達完了` の順に進み、発送前なら `キャンセル` できます。
- 購入者は注文番号とメールアドレスで注文状況を確認できます（ログイン不要）。

## 技術構成

- Node.js 22.5 以上（組み込みの `node:sqlite` を使用）
- Express 5
- SQLite（ファイル 1 つ。外部 DB サーバー不要）
- 画面はビルド不要の素の HTML / JavaScript
- テストは `node:test`

## 使い方

```sh
npm install
npm run seed                  # サンプル商品を登録
ADMIN_TOKEN=change-me npm start
```

`http://localhost:3000` でショップ、`http://localhost:3000/admin/` で管理画面が開きます。
管理画面には `ADMIN_TOKEN` に設定した値でログインします。

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `DATABASE_PATH` | `./data/candle.db` | SQLite ファイルのパス |
| `ADMIN_TOKEN` | なし | 管理 API の認証トークン。未設定だと管理 API は使えません |

`.env.example` に設定例があります（`.env` の自動読み込みはしていないので、環境変数として渡してください）。

テスト:

```sh
npm test
```

## API

購入者向け（認証なし）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/config` | 料金設定 |
| GET | `/api/products` | 公開中の商品一覧 |
| GET | `/api/products/:id` | 商品詳細 |
| POST | `/api/orders` | 注文作成 |
| POST | `/api/orders/lookup` | 注文照会（`order_number` と `email`） |

管理者向け（`Authorization: Bearer <ADMIN_TOKEN>`）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/admin/products` | 全商品一覧 |
| POST | `/api/admin/products` | 商品追加 |
| PATCH | `/api/admin/products/:id` | 商品更新（部分更新） |
| GET | `/api/admin/orders?status=&limit=&offset=` | 注文一覧 |
| GET | `/api/admin/orders/:id` | 注文詳細 |
| PATCH | `/api/admin/orders/:id/status` | 状態変更（`status`, 任意で `admin_note`） |

注文作成のリクエスト例:

```json
{
  "customer_name": "山田 花子",
  "customer_email": "hanako@example.com",
  "recipient_name": "佐藤 太郎",
  "recipient_postal_code": "150-0001",
  "recipient_address": "東京都渋谷区神宮前1-2-3",
  "gift_wrapping": true,
  "gift_message": "お誕生日おめでとう！",
  "items": [{ "product_id": 1, "quantity": 2 }]
}
```

## ディレクトリ構成

```
src/
  app.js              ルーティングとエラーハンドリング
  server.js           起動スクリプト
  seed.js             サンプルデータ投入
  db.js               スキーマとトランザクション
  pricing.js          料金計算
  validation.js       入力検証
  services/catalog.js 商品
  services/orders.js  注文・在庫・状態遷移
public/               ショップ画面と管理画面
test/                 API テスト
```

## 今後の拡張を見据えた設計

- **法人購入**: `orders` に `customer_type`（既定 `individual`）と `company_name` を用意済み。
  請求書払い・複数配送先などは注文作成処理の拡張で対応できます。
- **複数出品者**: 業務ロジックは `services/` に閉じているため、`shops` テーブルを追加して
  商品・注文に `shop_id` を持たせる形で拡張できます。
- **決済**: 現在は注文受付のみで決済はしていません。`pending`（受付）の後に決済を挟み、
  成功時に `confirmed` へ進める想定です。
- **メール通知・管理者アカウント**: 未実装。管理認証は共有トークン 1 つの簡易方式です。
- 日時は UTC で保存・表示しています。
