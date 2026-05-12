# ============================================================================
# SNS Topic（共通アラート通知先）
# ============================================================================
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-scraper-alerts"

  lifecycle {
    prevent_destroy = true
  }
}

# Email Subscription
# ※ 初回は AWS から確認メールが届く。受信者が手動でリンクを踏んで承認しないと
#   通知が届かない。Terraform はサブスクリプションを作るだけ。
resource "aws_sns_topic_subscription" "alerts_email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# ============================================================================
# CloudWatch Alarm: Lambda Errors（ステージごと）
# - 5 分間で 1 件以上の Errors が出たら SNS に発報
# - SNS 経由でメール通知（要事前承認）
# ============================================================================
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.stages

  alarm_name          = "${var.name_prefix}-${each.key}-errors"
  alarm_description   = "Lambda ${var.name_prefix}-${each.key} が 5 分以内にエラーを記録した"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.stage[each.key].function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ============================================================================
# CloudWatch Alarm: Step Functions ExecutionsFailed (salons-pipeline)
# - SFN 経由で動かす salons / discover→link 系の失敗を SNS に発報する。
# - Lambda Errors アラームは個々の Lambda 単位なので、リトライ込みで最終的に
#   ExecutionFailed になったケースを別軸で拾う狙い。
# ============================================================================
resource "aws_cloudwatch_metric_alarm" "sfn_salons_pipeline_failed" {
  alarm_name          = "${var.name_prefix}-salons-pipeline-failed"
  alarm_description   = "Step Functions ${aws_sfn_state_machine.salons_pipeline.name} の Execution が失敗した"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.salons_pipeline.arn
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}
