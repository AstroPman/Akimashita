output "account_id" {
  description = "適用先の AWS アカウント ID"
  value       = local.account_id
}

output "region" {
  description = "適用先の AWS リージョン"
  value       = local.region
}

output "environment" {
  description = "デプロイ環境"
  value       = var.environment
}

# --- scraper モジュールから再エクスポート ---
output "scraper_ecr_repository_name" {
  description = "スクレイパー用 ECR リポジトリ名（イメージ push の宛先）"
  value       = module.scraper.ecr_repository_name
}

output "scraper_ecr_repository_url" {
  description = "スクレイパー用 ECR リポジトリ URL"
  value       = module.scraper.ecr_repository_url
}

output "scraper_lambda_function_names" {
  description = "ステージ → Lambda Function 名"
  value       = module.scraper.lambda_function_names
}

output "scraper_lambda_alias_name" {
  description = "全ステージ共通の Lambda エイリアス名（CI が update-alias で付け替える）"
  value       = module.scraper.lambda_alias_name
}

output "scraper_lambda_alias_arns" {
  description = "ステージ → Lambda Alias ARN（function_arn:live）"
  value       = module.scraper.lambda_alias_arns
}

output "scraper_schedule_arns" {
  description = "ステージ → EventBridge Schedule ARN"
  value       = module.scraper.schedule_arns
}

output "scraper_salons_pipeline_state_machine_arn" {
  description = "salons サブフェーズを直列実行する Step Functions ARN"
  value       = module.scraper.salons_pipeline_state_machine_arn
}

output "scraper_salons_areas_schedule_arn" {
  description = "salons / areas 単独 Schedule ARN（未設定なら null）"
  value       = module.scraper.salons_areas_schedule_arn
}

output "scraper_salons_pipeline_schedule_arn" {
  description = "salons / pipeline Schedule ARN（未設定なら null）"
  value       = module.scraper.salons_pipeline_schedule_arn
}

output "scraper_alerts_topic_arn" {
  description = "アラート用 SNS Topic ARN"
  value       = module.scraper.alerts_topic_arn
}

output "scraper_ssm_parameter_names" {
  description = "手動投入が必要な SSM Parameter 名"
  value       = module.scraper.ssm_parameter_names
}
