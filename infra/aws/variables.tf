variable "environment" {
  description = "デプロイ環境。default_tags の Environment や、リソース名のサフィックスに利用する。env/<env>/terraform.tfvars 経由で必ず指定する。"
  type        = string

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment は production または staging のいずれかを指定してください。"
  }
}

# === Scraper モジュール入力 =================================================

variable "scraper_image_tag" {
  description = "Lambda が参照する ECR イメージタグ。Makefile 経由で git 短縮 SHA が渡される前提。"
  type        = string
}

variable "scraper_schedule_state" {
  description = "EventBridge Schedule の有効状態。初期は DISABLED でスモークテスト後に ENABLED へ。"
  type        = string
  default     = "DISABLED"
}

variable "scraper_schedules" {
  description = "ステージごとの cron 式（UTC）。空文字 / 未指定のステージは Schedule を作らない。salons は専用変数で別途指定する。"
  type        = map(string)
  default = {
    therapists   = "cron(0 19 * * ? *)"   # JST 04:00 daily
    availability = "cron(*/10 * * * ? *)" # 5 分間隔
    notify       = "cron(*/10 * * * ? *)" # 5 分間隔（availability 直後）
  }
}

variable "scraper_salons_areas_schedule" {
  description = "salons / areas フェーズの cron 式（UTC）。デフォルトは毎月1日 JST 03:00。"
  type        = string
  default     = "cron(0 18 1 * ? *)"
}

variable "scraper_salons_pipeline_schedule" {
  description = "salons / discover→details→bookings→link を直列実行する Step Functions のスケジュール式。初期データが貯まるまでの高頻度運用向けにデフォルトは 10 分間隔。落ち着いたら日次 cron 等へ変更する。"
  type        = string
  default     = "rate(25 minutes)"
}

variable "supabase_url" {
  description = "Supabase API URL（公開情報、Lambda 環境変数）。"
  type        = string
}

variable "email_from" {
  description = "Resend で送信元として使うメールアドレス。"
  type        = string
}

variable "app_base_url" {
  description = "通知メール内のリンクで使う Web アプリのベース URL。"
  type        = string
}

variable "alert_emails" {
  description = "Lambda 失敗時のアラート通知先メール（複数可）。初回 confirmation を手動承認すること。"
  type        = list(string)
  default     = []
}
