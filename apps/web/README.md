# apps/web

Next.js 16 + Supabase + Stripe で構成されたフロントエンドアプリ。

## 開発サーバ

```bash
cd apps/web
npm run dev   # http://localhost:3000
```

ローカルでは `supabase start` で Supabase をローカル起動してから `.env.local` を整える。

## 環境変数

`.env.example` を `.env.local` にコピーし値を埋める。最低限必要なものは次のとおり。

| 変数 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバ Action / Webhook 用の service role |
| `STRIPE_SECRET_KEY` | Stripe シークレット（テスト/本番） |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証用シークレット |
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` | 月額プランの Price ID |
| `NEXT_PUBLIC_STRIPE_PRICE_YEARLY` | 年額プランの Price ID |
| `NEXT_PUBLIC_MAX_SEATS` | 限定サービスの席数上限（既定 30） |
| `NEXT_PUBLIC_SITE_URL` | 公開 URL（sitemap / OG / robots 用） |
| `CRON_SECRET` | Vercel Cron 起動時の認証用シークレット（後述） |
| `GITHUB_DISPATCH_TOKEN` | スクレイピング GH Actions を起動する fine-grained PAT |
| `GITHUB_OWNER` | リポジトリのオーナー名（例: `your-account`） |
| `GITHUB_REPO` | リポジトリ名（例: `akimashita`） |

## 主要画面

- `/` ランディング（限定 N 名表示・利用の流れ・FAQ）
- `/pricing` 料金プランと Stripe Checkout 開始
- `/waitlist` 満員時のウェイトリスト登録
- `/signup` `/login` 認証
- `/watches` 監視設定（サブスク有効ユーザのみ）
- `/account` アカウント／ご契約管理（Customer Portal 遷移）
- `/terms` `/privacy` `/contact` 規約・お問い合わせ

## 課金とゲーティング

- Stripe Checkout でサブスクリプションを作成（14 日間トライアル、カード登録必須）
- Webhook (`/api/stripe/webhook`) で `subscriptions` テーブルを同期
- `/watches` 配下は `subscriptions.status in (trialing, active, past_due)` または
  `canceled` かつ `current_period_end > now()` のユーザのみアクセス可
- 限定席数は Postgres RPC `try_reserve_seat` で advisory lock により直列化

## 招待トークン（限定枠の上書き）

`waitlist` テーブルに `invite_token` を発行し、当該ユーザに
`https://<site>/pricing?invite=<token>` を案内する。
受け取ったユーザは席数上限に関係なく Checkout に進める。
最初に有効化された時点で `signed_up_at` が立ち、トークンは無効化される。

例: 招待トークン発行（手動 SQL）

```sql
update waitlist
   set invite_token       = encode(gen_random_bytes(16), 'hex'),
       invited_at         = now(),
       invite_expires_at  = now() + interval '7 days'
 where email = 'someone@example.com'
returning email, invite_token;
```

## デプロイ前チェック

- Supabase: Site URL と Redirect URL に本番ドメインを追加し、確認メールテンプレを差し替える
- Stripe: 本番モードで Webhook エンドポイント `<site>/api/stripe/webhook` を登録し、シークレットを設定
- Stripe: 月額・年額の Price を本番モードで作成し、ID を `.env` に反映
- 法的書面: `/terms` `/privacy` `/contact` の文面を確定（テンプレ警告コメントを削除）
- `NEXT_PUBLIC_MAX_SEATS` を運用方針に合わせて確定

## Vercel Cron でスクレイピングを起動する

スクレイピング GH Actions（`.github/workflows/scraper-*.yml`）は、`schedule:` の遅延が大きいため Vercel Cron 経由で起動する構成になっている。

- スケジュール定義: [`vercel.json`](./vercel.json) の `crons`
- ディスパッチ用 Route Handler: [`src/app/api/cron/dispatch-scrape/route.ts`](./src/app/api/cron/dispatch-scrape/route.ts)
- Vercel Cron は **Production デプロイのみ** で稼働する。毎分実行は **Pro プラン以上** が必要

Vercel ダッシュボード（Project Settings → Environment Variables → Production）に以下を登録する。

| 変数 | 用途 | 値 |
|------|------|----|
| `CRON_SECRET` | Vercel Cron が `Authorization: Bearer` で送る値。Route 側で照合 | 16 文字以上のランダム文字列 |
| `GITHUB_DISPATCH_TOKEN` | GitHub `POST /repos/{owner}/{repo}/dispatches` の認証 | fine-grained PAT |
| `GITHUB_OWNER` | リポジトリオーナー | 例: `your-account` |
| `GITHUB_REPO` | リポジトリ名 | 例: `akimashita` |

Fine-grained PAT は次の権限のみ付与し、対象リポジトリを本リポジトリ 1 件に絞る。

- Repository permissions → **Contents: Read and write**
- Repository permissions → **Metadata: Read-only**（自動で必須付与）

動作確認:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  "https://<site>/api/cron/dispatch-scrape?type=availability-staging"
# → 200 {"ok":true,"type":"availability-staging"} かつ
#   GitHub Actions 側で scraper-availability-notify (staging) が起動すれば OK
```

`type` は `availability-production` / `availability-staging` / `therapists-production` のいずれか。これらは `.github/workflows/scraper-*.yml` の `repository_dispatch.types` と一致している。

