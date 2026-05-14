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
| `STRIPE_PRICE_STANDARD_MONTHLY` | スタンダード月額の Price ID |
| `STRIPE_PRICE_STANDARD_YEARLY` | スタンダード年額の Price ID |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | プレミアム月額の Price ID |
| `STRIPE_PRICE_PREMIUM_YEARLY` | プレミアム年額の Price ID |
| `NEXT_PUBLIC_SITE_URL` | 公開 URL（sitemap / OG / robots 用） |

## 主要ルート

- `/` ランディング（サービス紹介・FAQ・対応店舗など）
- `/pricing` 料金プランと Stripe Checkout 開始
- `/salons` 対応店舗一覧
- `/signup` `/login` `/forgot-password` 認証まわり
- `/watches` 監視一覧（全ユーザ閲覧可。プランごとに登録件数上限あり）
- `/watches/new` `/watches/[id]` `/watches/[id]/edit` 監視の作成・詳細・編集
- `/notifications` メール通知・お知らせ一覧（全ユーザ閲覧可）、`/notifications/email/[id]` `/notifications/announcement/[id]` 詳細
- `/rankings` ランキング表示（スタンダード以上）
- `/account` アカウント／ご契約管理（Customer Portal 遷移）
- `/reset-password` ログイン済みユーザ向けパスワード変更
- `/checkout/success` `/checkout/cancel` Checkout 結果
- `/terms` `/privacy` `/contact` 規約・お問い合わせ

## 課金プラン

3 段階のプラン構成。プラン定義は [`src/lib/plans.ts`](src/lib/plans.ts) に集約。

| プラン | 価格 | 監視数 | 通知遅延 | ランキング |
|--------|------|--------|----------|------------|
| 無料 (free) | ¥0 | 1 件 | 10 分 | × |
| スタンダード | 月 ¥1,980 / 年 ¥19,800 | 10 件 | 5 分 | ○ |
| プレミアム | 月 ¥4,980 / 年 ¥49,800 | 無制限 | 即時 | ○ |

- Stripe Checkout でサブスクリプションを作成（14 日間トライアル、カード登録必須）
- Webhook（`/api/stripe/webhook`）で `subscriptions.tier` / `subscriptions.cycle` / `users.plan_tier` を同期
- 通知遅延は DB 側 `notification_logs.send_after` で表現し、scraper はその時刻に達した行のみ送信する
- プラン変更時の挙動:
  - アップグレード: `proration_behavior: 'always_invoice'` で即時切替、差額を即時請求
  - ダウングレード: `proration_behavior: 'none'` で現周期は現プラン継続、次回更新から切替

### Stripe ダッシュボードでの作業（手動）

新規環境では以下を作成する必要がある。

1. Products を 2 つ作成（Standard / Premium）
2. それぞれに月額・年額の Price を作成（合計 4 つ。JPY、recurring）
3. Webhook エンドポイント `<site>/api/stripe/webhook` を登録（`customer.subscription.*` `checkout.session.completed` `invoice.paid` `invoice.payment_failed`）
4. 4 つの Price ID を `STRIPE_PRICE_{STANDARD,PREMIUM}_{MONTHLY,YEARLY}` に反映

## スクレイピングの定期実行（本リポジトリ全体）

定期の空き取得・通知などは **Vercel Cron では運用していない**。スケジュールは **AWS EventBridge Scheduler → Lambda**（`infra/aws` の `modules/scraper`、`apps/scraper` のコンテナイメージ）側で管理する。GitHub Actions（`.github/workflows/scraper-*.yml`）はデプロイや手動実行・補助トリガー用として使う想定で、スケジュールの主役は AWS 側である。

詳細は `infra/aws`、`.cursor/rules/scraper.mdc`、`apps/scraper` のソースを参照。

## デプロイ前チェック

- Supabase: Site URL と Redirect URL に本番ドメインを追加し、確認メールテンプレを差し替える
- Stripe: 本番モードで Webhook エンドポイント `<site>/api/stripe/webhook` を登録し、シークレットを設定
- Stripe: スタンダード / プレミアム × 月額 / 年額（計 4 つ）の Price を本番モードで作成し、ID を `STRIPE_PRICE_*` に反映
- 法的書面: `/terms` `/privacy` `/contact` の文面を確定（テンプレ警告コメントを削除）
