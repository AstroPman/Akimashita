# ============================================================================
# EventBridge Scheduler
# - 各ステージに対し schedule_expression が指定されているもののみ生成。
# - 初期 state は変数経由で DISABLED にして、スモークテスト後に ENABLED へ。
#
# salons ステージは 2 系統で起動するため、この for_each からは除外する。
#   - 月 1 回 phase=areas を Lambda 直接呼び出し  → salons_areas
#   - 定期で SFN を StartExecution            → salons_pipeline
#
# therapists / availability も eyoyaku 専用に Schedule を分けているため、
# for_each からは意図的に除外する (個別 resource として定義)。
#   - therapists: メインは全サイト対象 (1 日 1 回, exclude_site=[eyoyaku])
#                eyoyaku 専用は別 cron でブートストラップ用に max_per_site で制御
#   - availability: メインは 1 分間隔 (exclude_site=[eyoyaku])
#                  eyoyaku は 5 分間隔の専用 Schedule
# ============================================================================

# ----------------------------------------------------------------------------
# Schedule Group: 環境ごとに 1 つ作成し、本モジュールの全 Schedule を所属させる。
# - コンソールでの一覧 / 一括操作（DISABLE 等）が環境単位で行えるようになる。
# - group_name の変更は Schedule 側で ForceNew のため、既存環境では default
#   グループから本グループへ移行する初回 apply で Schedule が再作成される。
# ----------------------------------------------------------------------------
resource "aws_scheduler_schedule_group" "scraper" {
  name = var.name_prefix
}

resource "aws_scheduler_schedule" "stage" {
  for_each = {
    for stage_name, _ in local.stages :
    stage_name => var.schedules[stage_name]
    if stage_name != "salons" &&
    stage_name != "therapists" &&
    stage_name != "availability" &&
    contains(keys(var.schedules), stage_name) &&
    var.schedules[stage_name] != ""
  }

  name       = "${var.name_prefix}-${each.key}"
  group_name = aws_scheduler_schedule_group.scraper.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = each.value
  schedule_expression_timezone = "UTC" # cron は UTC で書く（JST = UTC+9）

  state = var.schedule_state

  # Lambda 関数本体ではなく live エイリアスを叩く。CI が新バージョンに
  # alias を付け替えれば、Schedule 側の更新無しで切替が反映される。
  target {
    arn      = aws_lambda_alias.stage[each.key].arn
    role_arn = aws_iam_role.scheduler.arn
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# ----------------------------------------------------------------------------
# therapists: メイン Schedule (eyoyaku 除外)
# ----------------------------------------------------------------------------
# 1 日 1 回、caskan / grow / edc / estama の 4 サイトを巡回する。
# eyoyaku は別 Schedule (`therapists_eyoyaku`) でブートストラップ + 段階更新するため、
# input.exclude_site で必ず外す。
resource "aws_scheduler_schedule" "therapists_main" {
  count = lookup(var.schedules, "therapists", "") == "" ? 0 : 1

  name       = "${var.name_prefix}-therapists"
  group_name = aws_scheduler_schedule_group.scraper.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedules["therapists"]
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_lambda_alias.stage["therapists"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ exclude_site = ["eyoyaku"] })
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# ----------------------------------------------------------------------------
# therapists: eyoyaku 専用 Schedule
# ----------------------------------------------------------------------------
# 駅ちか系 WAF は短時間に多店舗を巡回するとブロックされるため、
# 1 ジョブで処理するサロン数を max_per_site で制限し、毎日少しずつ巡回することで
# - 初回 131 サロンを数日かけて完走
# - 既存サロンの差分更新
# を両立させる。
#
# only_unsynced=false にすることで last_synced_at の古い順 (= 飢餓状態のサロンを
# 先に追いつかせる) に巡回される。max_per_site=20 + delay 平均 10 秒で 1 ジョブ
# あたり最大 ~5 分。WAF を踏まなければ全 131 サロンが約 7 日でローテーションする。
#
# var.schedules["therapists_eyoyaku"] が空文字 / 未指定なら作成しない。
resource "aws_scheduler_schedule" "therapists_eyoyaku" {
  count = lookup(var.schedules, "therapists_eyoyaku", "") == "" ? 0 : 1

  name       = "${var.name_prefix}-therapists-eyoyaku"
  group_name = aws_scheduler_schedule_group.scraper.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedules["therapists_eyoyaku"]
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_lambda_alias.stage["therapists"].arn
    role_arn = aws_iam_role.scheduler.arn
    input = jsonencode({
      site         = ["eyoyaku"]
      max_per_site = 20
    })
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# ----------------------------------------------------------------------------
# availability: メイン Schedule (1 分間隔 / eyoyaku 除外)
# ----------------------------------------------------------------------------
# caskan / grow / edc / estama の 4 サイトを 1 分ごとに巡回する本流。
# eyoyaku だけは別 Schedule で 5 分間隔に分離するため exclude_site で外す。
resource "aws_scheduler_schedule" "availability_main" {
  count = lookup(var.schedules, "availability", "") == "" ? 0 : 1

  name       = "${var.name_prefix}-availability"
  group_name = aws_scheduler_schedule_group.scraper.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedules["availability"]
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_lambda_alias.stage["availability"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ exclude_site = ["eyoyaku"] })
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# ----------------------------------------------------------------------------
# availability: eyoyaku 専用 Schedule (5 分間隔)
# ----------------------------------------------------------------------------
# 駅ちか系 WAF を踏まないために間隔を 1 分→5 分に伸ばし、watch されている
# eyoyaku セラピストのみを巡回する。notify latency は 1 分→5 分まで悪化するが、
# 完全にブロックされて 0 件になるよりは遥かに優先される設計。
#
# var.schedules["availability_eyoyaku"] が空文字 / 未指定なら作成しない。
resource "aws_scheduler_schedule" "availability_eyoyaku" {
  count = lookup(var.schedules, "availability_eyoyaku", "") == "" ? 0 : 1

  name       = "${var.name_prefix}-availability-eyoyaku"
  group_name = aws_scheduler_schedule_group.scraper.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedules["availability_eyoyaku"]
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_lambda_alias.stage["availability"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ site = ["eyoyaku"] })
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

  name       = "${var.name_prefix}-salons-areas"
  group_name = aws_scheduler_schedule_group.scraper.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.salons_areas_schedule
  schedule_expression_timezone = "UTC"

  state = var.schedule_state

  target {
    arn      = aws_lambda_alias.stage["salons"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ phase = "areas" })
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# ----------------------------------------------------------------------------
# salons / discover→details→bookings→link を直列実行する Step Functions の
# StartExecution を定期実行するスケジュール（頻度はルート変数で指定）。
# - `var.salons_pipeline_schedule` が空文字 / 未指定なら作成しない。
# ----------------------------------------------------------------------------
resource "aws_scheduler_schedule" "salons_pipeline" {
  count = var.salons_pipeline_schedule == "" ? 0 : 1

  name       = "${var.name_prefix}-salons-pipeline"
  group_name = aws_scheduler_schedule_group.scraper.name

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
