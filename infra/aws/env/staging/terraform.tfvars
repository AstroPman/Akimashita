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
scraper_schedule_state = "ENABLED"
scraper_schedules = {
    therapists   = "cron(0 19 * * ? *)"   # JST 04:00 daily
    availability = "cron(0 * * * ? *)"    #  1 時間間隔
    notify       = "cron(0 * * * ? *)"    # 1 時間間隔（availability 直後）
}

scraper_salons_pipeline_schedule = "cron(0 18 * * ? *)" # JST 03:00 daily