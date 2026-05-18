# apps/dashboard

アキマシタの **運営者向けダッシュボード**。
本番 Supabase に **service_role** で直接接続し、ユーザ数・テーブル件数・通知 / スクレイパの健全性を可視化する。

## ⚠ 重要な運用ルール

このアプリは **ローカル限定運用** を前提に作られている。

- **Vercel / 任意の公開ホスト等にデプロイしない**。
- `.env.local` には本番 Supabase の `SUPABASE_SERVICE_ROLE_KEY` を入れるため、絶対にコミット・共有しないこと。
- コードは **読み取り専用**（SELECT / RPC のみ）で書く。Server Action や `insert/update/upsert/delete` を追加しない。
- 認証は組んでいない。`localhost` のままで起動し、別マシンから到達可能な状態にしない。

## セットアップ

```bash
cd apps/dashboard
cp .env.local.example .env.local
# .env.local に Supabase Studio から取得した service_role キーを設定
npm install # ルートで一括 install 済みなら不要
npm run dev # http://localhost:3001
```

ポートは web (`apps/web`) と衝突しないよう **3001** 固定。

## 提供する画面

| パス               | 内容                                                      |
| ------------------ | --------------------------------------------------------- |
| `/`                | 主要 KPI の横断サマリ                                     |
| `/users`           | ユーザ総数 / プラン別 / 累積推移 (30 / 90 / 365 日切替)   |
| `/tables`          | external_salons / external_therapists の推移とリンク状況  |
| `/notifications`   | 通知の成功率・遅延 p50/p95・pending 最古・failed TOP5     |
| `/scraper`         | 各 `*_synced_at` の鮮度・availability_events 直近 24h     |

## 依存している RPC

`supabase/migrations/20260518000000_admin_dashboard_stats.sql` で定義した `stats_*` 関数群。
すべて `service_role` のみに `grant execute` してある。

## 期間切り替え

`/users`, `/tables` は `?range=30|90|365` のクエリで切替（Server Component の `searchParams`）。
デフォルトは 30 日。
