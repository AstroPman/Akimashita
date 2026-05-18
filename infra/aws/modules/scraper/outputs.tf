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

output "lambda_alias_name" {
  description = "全ステージ共通の Lambda エイリアス名（CI が update-alias で付け替える）"
  value       = "live"
}

output "lambda_alias_arns" {
  description = "ステージ → Lambda Alias ARN（function_arn:live 形式。Scheduler / SFN / Alarm 全てここを参照）"
  value       = { for k, a in aws_lambda_alias.stage : k => a.arn }
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

output "dashboard_name" {
  description = "CloudWatch Dashboard 名（enable_dashboard = false の場合は null）"
  value       = try(aws_cloudwatch_dashboard.scraper[0].dashboard_name, null)
}

output "dashboard_url" {
  description = "CloudWatch Dashboard のコンソール URL（enable_dashboard = false の場合は null）"
  value = try(
    format(
      "https://%s.console.aws.amazon.com/cloudwatch/home?region=%s#dashboards:name=%s",
      data.aws_region.current.region,
      data.aws_region.current.region,
      aws_cloudwatch_dashboard.scraper[0].dashboard_name,
    ),
    null,
  )
}

output "ssm_parameter_names" {
  description = "手動投入が必要な SSM Parameter 名（aws ssm put-parameter --overwrite で値を入れる）"
  value = {
    SUPABASE_SERVICE_ROLE_KEY = aws_ssm_parameter.supabase_service_role_key.name
    RESEND_API_KEY            = aws_ssm_parameter.resend_api_key.name
  }
}
