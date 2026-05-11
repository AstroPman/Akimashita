variable "billing_alert_emails" {
  description = "請求アラートを通知するメールアドレス（最低 1 件）。terraform.tfvars で指定する。"
  type        = list(string)

  validation {
    condition     = length(var.billing_alert_emails) > 0
    error_message = "billing_alert_emails には少なくとも 1 件のメールアドレスを指定してください。"
  }
}
