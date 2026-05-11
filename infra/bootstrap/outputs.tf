output "terraform_state_bucket_name" {
  description = "Terraform State 用 S3 バケット名（infra/aws の backend.bucket と一致させる）"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "terraform_state_bucket_arn" {
  description = "Terraform State 用 S3 バケットの ARN"
  value       = aws_s3_bucket.terraform_state.arn
}

output "terraform_state_bucket_region" {
  description = "Terraform State 用 S3 バケットのリージョン"
  value       = aws_s3_bucket.terraform_state.region
}

output "monthly_account_budget_name" {
  description = "アカウント月次予算の名前"
  value       = aws_budgets_budget.monthly_account.name
}
