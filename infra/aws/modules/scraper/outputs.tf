output "ecr_repository_name" {
  description = "ECR リポジトリ名"
  value       = aws_ecr_repository.scraper.name
}

output "ecr_repository_url" {
  description = "ECR リポジトリの URL（push 先 / Lambda image_uri のベース）"
  value       = aws_ecr_repository.scraper.repository_url
}

output "ecr_repository_arn" {
  description = "ECR リポジトリの ARN"
  value       = aws_ecr_repository.scraper.arn
}

output "lambda_function_names" {
  description = "ステージ → Lambda Function 名"
  value       = { for k, fn in aws_lambda_function.stage : k => fn.function_name }
}

output "lambda_function_arns" {
  description = "ステージ → Lambda Function ARN"
  value       = { for k, fn in aws_lambda_function.stage : k => fn.arn }
}

output "schedule_arns" {
  description = "ステージ → EventBridge Schedule ARN（schedule 設定があるステージのみ）"
  value       = { for k, s in aws_scheduler_schedule.stage : k => s.arn }
}

output "alerts_topic_arn" {
  description = "アラート用 SNS Topic ARN"
  value       = aws_sns_topic.alerts.arn
}

output "ssm_parameter_names" {
  description = "手動投入が必要な SSM Parameter 名（aws ssm put-parameter --overwrite で値を入れる）"
  value = {
    SUPABASE_SERVICE_ROLE_KEY = aws_ssm_parameter.supabase_service_role_key.name
    RESEND_API_KEY            = aws_ssm_parameter.resend_api_key.name
  }
}
