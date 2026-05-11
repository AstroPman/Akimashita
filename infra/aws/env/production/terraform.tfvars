environment = "production"

# Supabase production（プロジェクト ID 確定後に更新する）
supabase_url = "https://PRODUCTION-PROJECT-ID.supabase.co"

# 通知系（本番ドメイン取得後に更新する）
email_from   = "noreply@akimashita.example.com"
app_base_url = "https://akimashita.example.com"

# Lambda 失敗時のアラート通知先
alert_emails = []

# 本番も初期は DISABLED 推奨。staging で疎通確認した後に ENABLED にする。
scraper_schedule_state = "DISABLED"
