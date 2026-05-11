variable "name_prefix" {
  description = "リソース名プレフィックス（例: akimashita-staging）。ルートモジュールから渡す。"
  type        = string
}

# === ECR ====================================================================

variable "ecr_keep_image_count" {
  description = "ECR に保持するタグ付きイメージの最大数。古いものから自動削除。"
  type        = number
  default     = 10
}

variable "ecr_untagged_expire_days" {
  description = "untagged イメージを削除するまでの日数。"
  type        = number
  default     = 7
}

# === Lambda =================================================================

variable "image_tag" {
  description = "Lambda Function に紐付ける ECR イメージタグ。Makefile が git SHA を渡す前提。"
  type        = string
}

# === EventBridge Scheduler ==================================================

variable "schedules" {
  description = "ステージ名 → cron / rate 式 のマップ。未指定のステージは Schedule 自体が作られない。"
  type        = map(string)
  default     = {}
}

variable "schedule_state" {
  description = "Schedule の有効状態。初期は DISABLED で安全側、スモークテスト後に ENABLED へ。"
  type        = string
  default     = "DISABLED"

  validation {
    condition     = contains(["ENABLED", "DISABLED"], var.schedule_state)
    error_message = "schedule_state は ENABLED / DISABLED のいずれか。"
  }
}

# === Application 環境変数（公開情報。秘密値は SSM 経由） ==================

variable "supabase_url" {
  description = "Supabase API URL（公開情報。Lambda 環境変数として渡す）。"
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

# === アラート ===============================================================

variable "alert_emails" {
  description = "Lambda 失敗時に通知する SNS 購読メール（複数可）。各アドレスは初回 confirmation を手動で承認する必要あり。"
  type        = list(string)
  default     = []
}
