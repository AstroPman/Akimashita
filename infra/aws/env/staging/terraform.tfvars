environment = "staging"

# Supabase staging（core.mdc 参照）
supabase_url = "https://zhvmhchwapavylwrchoe.supabase.co"

# 通知系（暫定値。Resend で verified domain を取得後に更新する）
email_from   = "noreply@akimashita.example.com"
app_base_url = "https://staging.akimashita.example.com"

# Lambda 失敗時のアラート通知先（受信後に手動で confirmation を承認すること）
alert_emails = []

# Schedule の初期状態。ENABLED にすると本物の cron 起動が始まる。
# スモークテストを完了してから "ENABLED" に変更する。
scraper_schedule_state = "DISABLED"
