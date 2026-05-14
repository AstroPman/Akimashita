environment = "production"

# Supabase staging（core.mdc 参照）
supabase_url = "https://zhvmhchwapavylwrchoe.supabase.co"

# 通知系。ステージングは Resend のテスト用送信元（検証ドメイン不要）。本番は verified domain のアドレスに差し替える。
email_from   = "Akimashita <info@akimashita.com>"
app_base_url = "https://akimashita.com"

# Lambda 失敗時のアラート通知先（受信後に手動で confirmation を承認すること）
alert_emails = []

# Schedule の初期状態。ENABLED にすると本物の cron 起動が始まる。
# スモークテストを完了してから "ENABLED" に変更する。
scraper_schedule_state = "ENABLED"
