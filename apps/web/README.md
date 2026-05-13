# apps/web

Next.js 16（App Router）+ TypeScript + Tailwind CSS v4 で構成されたフロントエンド。認証・DB は Supabase、課金は Stripe。共通型・定数はワークスペースパッケージ `@alimashita/shared` を参照する。

## 開発サーバ

```bash
cd apps/web
npm run dev   # http://localhost:3000
```

ローカルではリポジトリルートで `supabase start` を実行し、Supabase を起動してから `.env.local` を整える。

## `src` の構成

| パス | 役割 |
|------|------|
| `app/(authenticated)/` | ログイン後エリア。監視一覧・編集、通知、ランキング、アカウント、パスワード再設定など |
| `app/(auth)/` | ログイン・新規登録・パスワード忘れ |
| `app/(legal)/` | 利用規約・プライバシー・お問い合わせ（共通レイアウト） |
| `app/auth/` | OAuth コールバック・サインアウト用 Route Handler |
| `app/api/` | Stripe Webhook などサーバ専用 API |
| `app/checkout/` | Checkout 完了・キャンセル画面 |
| `components/` | shadcn 系 UI とランディング用セクション |
| `lib/` | Supabase クライアント、Stripe、Zod スキーマ、ドメインロジック |
| `middleware.ts` | セッション更新など |

## 環境変数

`.env.example` を `.env.local` にコピーし値を埋める。アプリが参照する主な変数は次のとおり。

| 変数 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバ Action / Webhook 用の service role |
| `STRIPE_SECRET_KEY` | Stripe シークレット（テスト/本番） |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証用シークレット |
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` | 月額プランの Price ID |
| `NEXT_PUBLIC_STRIPE_PRICE_YEARLY` | 年額プランの Price ID |
| `NEXT_PUBLIC_MAX_SEATS` | 限定サービスの席数上限（未設定時は 30） |
| `NEXT_PUBLIC_SITE_URL` | 公開 URL（sitemap / OG / robots 用） |

## 主要ルート

- `/` ランディング（席数表示・利用の流れ・FAQ・対応店舗など）
- `/pricing` 料金プランと Stripe Checkout 開始
- `/waitlist` 満員時のウェイトリスト登録
- `/salons` 対応店舗一覧
- `/signup` `/login` `/forgot-password` 認証まわり
- `/watches` 監視一覧（サブスク条件を満たすユーザのみ）
- `/watches/new` `/watches/[id]` `/watches/[id]/edit` 監視の作成・詳細・編集
- `/notifications` メール通知・お知らせ一覧、`/notifications/email/[id]` `/notifications/announcement/[id]` 詳細
- `/rankings` ランキング表示
- `/account` アカウント／ご契約管理（Customer Portal 遷移）
- `/reset-password` ログイン済みユーザ向けパスワード変更
- `/checkout/success` `/checkout/cancel` Checkout 結果
- `/terms` `/privacy` `/contact` 規約・お問い合わせ

## 課金とゲーティング

- Stripe Checkout でサブスクリプションを作成（14 日間トライアル、カード登録必須）
- Webhook（`/api/stripe/webhook`）で `subscriptions` テーブルを同期
- `/watches` 配下など認証後の主要機能は、`subscriptions.status in (trialing, active, past_due)` または `canceled` かつ `current_period_end > now()` のユーザのみアクセス可
- 限定席数は Postgres RPC `try_reserve_seat` で advisory lock により直列化

## 招待トークン（限定枠の上書き）

`waitlist` テーブルに `invite_token` を発行し、当該ユーザに `https://<site>/pricing?invite=<token>` を案内する。受け取ったユーザは席数上限に関係なく Checkout に進める。最初に有効化された時点で `signed_up_at` が立ち、トークンは無効化される。

例: 招待トークン発行（手動 SQL）

```sql
update waitlist
   set invite_token       = encode(gen_random_bytes(16), 'hex'),
       invited_at         = now(),
       invite_expires_at  = now() + interval '7 days'
 where email = 'someone@example.com'
returning email, invite_token;
```

## スクレイピングの定期実行（本リポジトリ全体）

定期の空き取得・通知などは **Vercel Cron では運用していない**。スケジュールは **AWS EventBridge Scheduler → Lambda**（`infra/aws` の `modules/scraper`、`apps/scraper` のコンテナイメージ）側で管理する。GitHub Actions（`.github/workflows/scraper-*.yml`）はデプロイや手動実行・補助トリガー用として使う想定で、スケジュールの主役は AWS 側である。

詳細は `infra/aws`、`.cursor/rules/scraper.mdc`、`apps/scraper` のソースを参照。

## デプロイ前チェック

- Supabase: Site URL と Redirect URL に本番ドメインを追加し、確認メールテンプレを差し替える
- Stripe: 本番モードで Webhook エンドポイント `<site>/api/stripe/webhook` を登録し、シークレットを設定
- Stripe: 月額・年額の Price を本番モードで作成し、ID を環境変数に反映
- 法的書面: `/terms` `/privacy` `/contact` の文面を確定（テンプレ警告コメントを削除）
- `NEXT_PUBLIC_MAX_SEATS` を運用方針に合わせて確定
