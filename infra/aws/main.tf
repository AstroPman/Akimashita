data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region

  name_prefix = "akimashita-${var.environment}"
}

# ----------------------------------------------------------------------------
# スクレイパー実行基盤（ECR / IAM / Lambda / Scheduler / SNS / Alarms 一式）
# 現状は ECR のみ。Lambda 等は後続で modules/scraper/ に追加していく。
# ----------------------------------------------------------------------------
module "scraper" {
  source = "./modules/scraper"

  name_prefix = local.name_prefix

  image_tag      = var.scraper_image_tag
  schedules      = var.scraper_schedules
  schedule_state = var.scraper_schedule_state

  supabase_url = var.supabase_url
  email_from   = var.email_from
  app_base_url = var.app_base_url

  alert_emails = var.alert_emails
}
