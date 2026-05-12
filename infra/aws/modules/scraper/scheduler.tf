# ============================================================================
# EventBridge Scheduler
# - 各ステージに対し schedule_expression が指定されているもののみ生成。
# - 初期 state は変数経由で DISABLED にして、スモークテスト後に ENABLED へ。
#
# salons ステージは 2 系統で起動するため、この for_each からは除外する。
#   - 月 1 回 phase=areas を Lambda 直接呼び出し  → salons_areas
#   - 1 日 1 回 SFN を StartExecution            → salons_pipeline
# ============================================================================
resource "aws_scheduler_schedule" "stage" {
  for_each = {
    for stage_name, _ in local.stages :
    stage_name => var.schedules[stage_name]
    if stage_name != "salons" && contains(keys(var.schedules), stage_name) && var.schedules[stage_name] != ""
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

# ----------------------------------------------------------------------------
# salons / areas フェーズ専用スケジュール
# - 頻度が低い (月 1 回) ため SFN に乗せず、Lambda を input 固定で直接呼ぶ。
# - `var.salons_areas_schedule` が空文字 / 未指定なら作成しない。
# ----------------------------------------------------------------------------
resource "aws_scheduler_schedule" "salons_areas" {
  count = var.salons_areas_schedule == "" ? 0 : 1

  name = "${var.name_prefix}-salons-areas"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.salons_areas_schedule
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_lambda_function.stage["salons"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ phase = "areas" })
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# ----------------------------------------------------------------------------
# salons / discover→details→bookings→link を直列実行する Step Functions の
# StartExecution を 1 日 1 回叩くスケジュール。
# - `var.salons_pipeline_schedule` が空文字 / 未指定なら作成しない。
# ----------------------------------------------------------------------------
resource "aws_scheduler_schedule" "salons_pipeline" {
  count = var.salons_pipeline_schedule == "" ? 0 : 1

  name = "${var.name_prefix}-salons-pipeline"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.salons_pipeline_schedule
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_sfn_state_machine.salons_pipeline.arn
    role_arn = aws_iam_role.scheduler_sfn.arn
  }

  depends_on = [aws_iam_role_policy.scheduler_sfn]
}
