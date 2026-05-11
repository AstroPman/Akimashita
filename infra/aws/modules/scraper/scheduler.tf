# ============================================================================
# EventBridge Scheduler
# - 各ステージに対し schedule_expression が指定されているもののみ生成。
# - 初期 state は変数経由で DISABLED にして、スモークテスト後に ENABLED へ。
# ============================================================================
resource "aws_scheduler_schedule" "stage" {
  for_each = {
    for stage_name, _ in local.stages :
    stage_name => var.schedules[stage_name]
    if contains(keys(var.schedules), stage_name) && var.schedules[stage_name] != ""
  }

  name = "${var.name_prefix}-${each.key}"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = each.value
  schedule_expression_timezone = "UTC" # cron は UTC で書く（JST = UTC+9）

  state = var.schedule_state

  target {
    arn      = aws_lambda_function.stage[each.key].arn
    role_arn = aws_iam_role.scheduler.arn
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}
