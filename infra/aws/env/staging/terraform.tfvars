environment = "staging"

# Supabase staging（core.mdc 参照）
supabase_url = "https://wontinfwjortmtmwfhyj.supabase.co"

# 通知系。ステージングは Resend のテスト用送信元（検証ドメイン不要）。本番は verified domain のアドレスに差し替える。
email_from   = "Akimashita(staging) <info@akimashita.com>"
app_base_url = "https://staging.akimashita.com"

# Lambda 失敗時のアラート通知先（受信後に手動で confirmation を承認すること）
alert_emails = ["astroqman@gmail.com"]

# Schedule の初期状態。ENABLED にすると本物の cron 起動が始まる。
# スモークテストを完了してから "ENABLED" に変更する。
# 2026-07-15: men-esthe.jp 側にスクレイピングを検知されたため、全環境のスクレイピングを
# 一時停止する目的で DISABLED に切り替え。再開時に "ENABLED" へ戻す。
scraper_schedule_state = "DISABLED"
scraper_schedules = {
  therapists   = "cron(0 19 * * ? *)" # JST 04:00 daily (eyoyaku 除外)
  availability = "cron(0 * * * ? *)"  #  1 時間間隔 (eyoyaku 除外)
  notify       = "cron(0 * * * ? *)"  #  1 時間間隔（availability 直後）
  # Stage 5: 公式サイト個別ページから shift_announced を発火する Layer 2。
  # 監視中セラピストのみが対象なのでホスト負荷は低く、availability と同じ頻度で回す。
  official_shifts = "cron(0 * * * ? *)" # 1 時間間隔
  # 研究モード (salons.research_enabled = true 配下を回す)。
  # 実測で caskan 複数サロン 133 人 ≒ 3 分 / grow 137 人 ≒ 6 分の規模。
  # まずは 15 分間隔から始め、grow ホスト並列度などのチューニングと合わせて頻度を見直す。
  availability_research = "cron(0 * * * ? *)" # 15 分間隔
  # eyoyaku 専用 Schedule (本番と同じ運用)。staging では低頻度に揃える。
  # ブートストラップは本番優先。staging は動作確認用に存在させるが頻度を低めに設定。
  therapists_eyoyaku   = "cron(30 19 * * ? *)" # JST 04:30 daily
  availability_eyoyaku = "cron(0 * * * ? *)"   # 1 時間間隔 (staging では低頻度)
}

scraper_salons_pipeline_schedule = "cron(0 18 * * ? *)" # JST 03:00 daily