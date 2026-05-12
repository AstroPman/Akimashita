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
  description = "Lambda Function 初回作成時に参照する ECR イメージタグ。以後の更新は CI/CD が aws lambda update-function-code で上書きするため、image_uri は ignore_changes で Terraform 管理外。"
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

# === salons 専用スケジュール ================================================
# salons は他ステージと異なり「単独 Lambda 起動 (areas) + Step Functions 起動
# (discover/details/bookings/link 直列)」の 2 系統で動かすため、
# var.schedules ではなく専用変数で受け取る。
# いずれも空文字を渡すと該当 Schedule を作らない。

variable "salons_areas_schedule" {
  description = "salons / areas フェーズの cron 式（UTC）。月 1 回程度を想定。空文字なら Schedule を作らない。"
  type        = string
  default     = ""
}

variable "salons_pipeline_schedule" {
  description = "salons / discover→details→bookings→link を直列実行する Step Functions のスケジュール式（cron または rate）。空文字なら Schedule を作らない。"
  type        = string
  default     = ""
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
