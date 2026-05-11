# アカウント全体の月次コスト監視。
# 「少しでも請求が始まったら検知」したいので、
# 予算を $1/月 に設定し、ACTUAL の 1%（= $0.01）超過で通知する。
resource "aws_budgets_budget" "monthly_account" {
  name         = "akimashita-monthly-account"
  budget_type  = "COST"
  limit_amount = "1"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # 実コストが $0.01 を超えた瞬間に通知（= 請求発生検知）
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 1
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.billing_alert_emails
  }

  # 予算を超え始めたら段階的に通知
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.billing_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.billing_alert_emails
  }

  # 月末予測が予算を超えそうな場合の事前通知
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.billing_alert_emails
  }
}
