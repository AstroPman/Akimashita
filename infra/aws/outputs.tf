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
