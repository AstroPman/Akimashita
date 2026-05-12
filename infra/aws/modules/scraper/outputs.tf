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
  description = "ステージ → EventBridge Schedule ARN（schedule 設定があるステージのみ）。salons 系は別 output を参照。"
  value       = { for k, s in aws_scheduler_schedule.stage : k => s.arn }
}

output "salons_pipeline_state_machine_arn" {
  description = "salons サブフェーズ (discover→details→bookings→link) を直列実行する Step Functions ARN。手動キック / コンソール確認用。"
  value       = aws_sfn_state_machine.salons_pipeline.arn
}

output "salons_areas_schedule_arn" {
  description = "salons / areas フェーズ単独 Schedule ARN（未設定なら null）"
  value       = try(aws_scheduler_schedule.salons_areas[0].arn, null)
}

output "salons_pipeline_schedule_arn" {
  description = "salons / pipeline Schedule ARN（未設定なら null）"
  value       = try(aws_scheduler_schedule.salons_pipeline[0].arn, null)
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
