# ============================================================================
# CloudWatch Dashboard: scraper
#
# 1 枚で次の 4 ブロックを俯瞰できるようにする。
#   Row 1: 無料枠の利用状況 (Billing / Lambda / Scheduler / SFN / Logs / SNS)
#   Row 2: Lambda ごとの Invocations / Errors / Duration (4 stage 重ね)
#   Row 3: Step Functions (salons-pipeline) の成否と所要時間
#   Row 4: アプリ固有メトリクス (Akimashita/Scraper, EMF 経由)
#
# CloudWatch Dashboard は 3 枚まで無料、メトリクス参照のみのため
# production / staging に 1 枚ずつ作っても追加課金 0。
# ============================================================================

locals {
  # `akimashita-staging` → `staging` を取り出す。lambda.tf の SCRAPER_ENVIRONMENT と
  # 必ず同じ値になるよう、同じパース式を共有する。
  dashboard_environment = split("-", var.name_prefix)[1]

  # GB-秒推計に使う「ステージ名 / function 名 / memory (GB)」の組み合わせ。
  # 表示の安定性のため stages を固定順で並べる (local.stages はキー順保証なし)。
  dashboard_stage_order = ["salons", "therapists", "availability", "notify"]

  dashboard_stage_info = [
    for s in local.dashboard_stage_order : {
      stage     = s
      function  = aws_lambda_function.stage[s].function_name
      memory_gb = local.stages[s].memory_mb / 1024.0
    }
  ]

  # GB-秒の MetricMath 式。i_<stage> = invocations, d_<stage> = avg duration (ms)。
  # 1 関数の GB-秒 = invocations × (duration_ms / 1000) × memory_gb
  # 形式: "i_salons * d_salons / 1000 * 0.5 + i_therapists * d_therapists / 1000 * 0.25 + ..."
  dashboard_gbs_expression = join(
    " + ",
    [
      for s in local.dashboard_stage_info :
      format("i_%s * d_%s / 1000 * %g", s.stage, s.stage, s.memory_gb)
    ],
  )

  # Logs IncomingBytes を集計する Log Group 一覧 (Lambda 4 本 + SFN 1 本)。
  dashboard_log_groups = concat(
    [for s in local.dashboard_stage_order : aws_cloudwatch_log_group.stage[s].name],
    [aws_cloudwatch_log_group.sfn_salons_pipeline.name],
  )

  # CloudWatch Dashboard は東京リージョン (このモジュールのデプロイ先) を使う。
  # Billing メトリクスだけは us-east-1 専用なので widget 個別に region を指定する。
  dashboard_region = data.aws_region.current.region
}

# Row 1: 無料枠の利用状況 -------------------------------------------------------
# - Billing EstimatedCharges (USD, MTD) → us-east-1 から取得
# - Lambda Invocations 合計 (30 日 sum)            ※ Always Free 1,000,000
# - Lambda GB-秒 推計 (30 日 sum, MetricMath)        ※ Always Free 400,000
# - EventBridge Scheduler InvocationAttemptCount    ※ Always Free 14,000,000
# - Step Functions ExecutionsStarted                ※ 1 実行 ≒ 12 transitions
# - CloudWatch Logs IncomingBytes (GB, 30 日 sum)   ※ Always Free 5GB
# - SNS NumberOfMessagesPublished / NotificationsDelivered (Email)
#
# Row 2: Lambda per stage (Invocations / Errors+Throttles / Duration)
#
# Row 3: Step Functions (salons-pipeline)
#
# Row 4: Application EMF metrics (Akimashita/Scraper, dim: Environment + Stage)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "scraper" {
  count = var.enable_dashboard ? 1 : 0

  dashboard_name = "${var.name_prefix}-scraper"

  dashboard_body = jsonencode({
    widgets = concat(
      # ------------------------------------------------------------------
      # Row 1 header
      # ------------------------------------------------------------------
      [
        {
          type   = "text"
          x      = 0
          y      = 0
          width  = 24
          height = 2
          properties = {
            markdown = "## 無料枠の利用状況 (直近 30 日 sum / MTD)\n\n[AWS Free Tier](https://aws.amazon.com/free/) の主要枠。**ETA を超えそうな数字は赤くハイライト**するため、各 widget の右上の閾値表記を確認すること。詳細は [.cursor/rules/infra_aws.mdc](https://github.com/) を参照。"
          }
        },

        # Row 1.1: Billing (us-east-1 のみ存在)
        {
          type   = "metric"
          x      = 0
          y      = 2
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Maximum"
            period = 21600
            region = "us-east-1"
            title  = "Estimated Charges (USD, MTD)"
            metrics = [
              ["AWS/Billing", "EstimatedCharges", "Currency", "USD"],
            ]
            sparkline = true
          }
        },

        # Row 1.2: Lambda Invocations 30 日合計 (全関数 SUM)
        {
          type   = "metric"
          x      = 6
          y      = 2
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Sum"
            period = 2592000
            region = local.dashboard_region
            title  = "Lambda Invocations (30d) / free 1M"
            metrics = concat(
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Invocations", "FunctionName", s.function,
                  { id = "i_${s.stage}", visible = false, stat = "Sum" }
                ]
              ],
              [
                [{
                  expression = join(" + ", [for s in local.dashboard_stage_info : "i_${s.stage}"])
                  label      = "Invocations 合計"
                  id         = "inv_total"
                }]
              ],
            )
            sparkline = true
          }
        },

        # Row 1.3: Lambda GB-秒推計 (MetricMath で invocations × duration × memory)
        {
          type   = "metric"
          x      = 12
          y      = 2
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Sum"
            period = 2592000
            region = local.dashboard_region
            title  = "Lambda GB-sec 推計 (30d) / free 400K"
            # CloudWatch Dashboard の metrics は「array of array (or expression object)」を
            # 期待する。Terraform の flatten() はネスト配列を再帰的に展開して
            # メトリクス配列の中身まで開いてしまうため使えない。代わりに
            # 「Invocations のみの for」と「Duration のみの for」を 2 段に
            # 分けて concat する (メトリクス順は MetricMath が id 参照なので不問)。
            metrics = concat(
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Invocations", "FunctionName", s.function,
                  { id = "i_${s.stage}", visible = false, stat = "Sum" }
                ]
              ],
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Duration", "FunctionName", s.function,
                  { id = "d_${s.stage}", visible = false, stat = "Average" }
                ]
              ],
              [
                [{
                  expression = local.dashboard_gbs_expression
                  label      = "GB-秒 合計 (推計)"
                  id         = "gbs_total"
                }]
              ],
            )
            sparkline = true
          }
        },

        # Row 1.4: CloudWatch Logs IncomingBytes (GB, 30 日 sum)
        {
          type   = "metric"
          x      = 18
          y      = 2
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Sum"
            period = 2592000
            region = local.dashboard_region
            title  = "Logs IncomingBytes (GB, 30d) / free 5GB"
            metrics = concat(
              [
                for i, lg in local.dashboard_log_groups :
                ["AWS/Logs", "IncomingBytes", "LogGroupName", lg,
                  { id = "lg${i}", visible = false, stat = "Sum" }
                ]
              ],
              [
                [{
                  expression = format(
                    "(%s) / 1024 / 1024 / 1024",
                    join(" + ", [for i, _ in local.dashboard_log_groups : "lg${i}"]),
                  )
                  label = "Logs ingest 合計 (GB)"
                  id    = "logs_gb"
                }]
              ],
            )
            sparkline = true
          }
        },

        # Row 1.5: EventBridge Scheduler InvocationAttemptCount (30 日 sum)
        {
          type   = "metric"
          x      = 0
          y      = 6
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Sum"
            period = 2592000
            region = local.dashboard_region
            title  = "Scheduler Invocations (30d) / free 14M"
            metrics = [
              ["AWS/Scheduler", "InvocationAttemptCount", "ScheduleGroup", aws_scheduler_schedule_group.scraper.name],
            ]
            sparkline = true
          }
        },

        # Row 1.6: SFN ExecutionsStarted (30 日 sum)
        # 注: salons-pipeline は 1 実行 ≒ 12 transitions。Always Free 4,000 / 月 に対して
        # 333 実行で危険水域 (一日 1 回なら ~30 実行で余裕、1 時間ごとなら 720 で即超過)。
        {
          type   = "metric"
          x      = 6
          y      = 6
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Sum"
            period = 2592000
            region = local.dashboard_region
            title  = "SFN Executions (30d) / free 4K transitions (≒333 exec)"
            metrics = [
              ["AWS/States", "ExecutionsStarted", "StateMachineArn", aws_sfn_state_machine.salons_pipeline.arn],
            ]
            sparkline = true
          }
        },

        # Row 1.7: SNS Publish / Email delivered (30 日 sum)
        {
          type   = "metric"
          x      = 12
          y      = 6
          width  = 6
          height = 4
          properties = {
            view   = "singleValue"
            stat   = "Sum"
            period = 2592000
            region = local.dashboard_region
            title  = "SNS Publish (30d) / free 1M, Email 1K"
            metrics = [
              ["AWS/SNS", "NumberOfMessagesPublished", "TopicName", aws_sns_topic.alerts.name, { label = "Published" }],
              [".", "NumberOfNotificationsDelivered", ".", ".", { label = "Delivered" }],
              [".", "NumberOfNotificationsFailed", ".", ".", { label = "Failed" }],
            ]
            sparkline = true
          }
        },

        # Row 1.8: ECR 注記 (CloudWatch にストレージメトリクスが無いため text 案内)
        {
          type   = "text"
          x      = 18
          y      = 6
          width  = 6
          height = 4
          properties = {
            markdown = "**ECR storage / free 500MB**\n\nCloudWatch には RepositoryStorageBytes が無いため、[ECR コンソール](https://ap-northeast-1.console.aws.amazon.com/ecr/repositories) で確認する。500MB 超過時は `var.ecr_keep_image_count` を縮小。"
          }
        },
      ],

      # ------------------------------------------------------------------
      # Row 2: Lambda per stage (Invocations / Errors+Throttles / Duration)
      # ------------------------------------------------------------------
      [
        {
          type   = "text"
          x      = 0
          y      = 10
          width  = 24
          height = 1
          properties = {
            markdown = "## Lambda per stage (5 分粒度)\n4 ステージを色分けで重ねる。`Resource = function:live` で絞らず全バージョン合算で表示しているが、実運用は live エイリアスのみ呼ばれる。"
          }
        },

        # Row 2.1: Invocations (stacked area)
        {
          type   = "metric"
          x      = 0
          y      = 11
          width  = 8
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = true
            stat    = "Sum"
            period  = 300
            region  = local.dashboard_region
            title   = "Invocations"
            metrics = [
              for s in local.dashboard_stage_info :
              ["AWS/Lambda", "Invocations", "FunctionName", s.function, { label = s.stage }]
            ]
          }
        },

        # Row 2.2: Errors + Throttles
        {
          type   = "metric"
          x      = 8
          y      = 11
          width  = 8
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = false
            stat    = "Sum"
            period  = 300
            region  = local.dashboard_region
            title   = "Errors / Throttles"
            metrics = concat(
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Errors", "FunctionName", s.function, { label = "errors:${s.stage}" }]
              ],
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Throttles", "FunctionName", s.function, { label = "throttles:${s.stage}" }]
              ],
            )
            yAxis = {
              left = { min = 0 }
            }
          }
        },

        # Row 2.3: Duration (p95 + max)
        {
          type   = "metric"
          x      = 16
          y      = 11
          width  = 8
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = false
            period  = 300
            region  = local.dashboard_region
            title   = "Duration (ms): p95 = solid, max = dashed"
            metrics = concat(
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Duration", "FunctionName", s.function, { label = "p95:${s.stage}", stat = "p95" }]
              ],
              [
                for s in local.dashboard_stage_info :
                ["AWS/Lambda", "Duration", "FunctionName", s.function, { label = "max:${s.stage}", stat = "Maximum" }]
              ],
            )
          }
        },
      ],

      # ------------------------------------------------------------------
      # Row 3: Step Functions (salons-pipeline)
      # ------------------------------------------------------------------
      [
        {
          type   = "text"
          x      = 0
          y      = 17
          width  = 24
          height = 1
          properties = {
            markdown = "## Step Functions: salons-pipeline (discover→details→bookings→therapists→link)"
          }
        },

        # Row 3.1: Executions Started / Succeeded / Failed / Aborted / TimedOut
        {
          type   = "metric"
          x      = 0
          y      = 18
          width  = 12
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = false
            stat    = "Sum"
            period  = 3600
            region  = local.dashboard_region
            title   = "Executions"
            metrics = [
              ["AWS/States", "ExecutionsStarted", "StateMachineArn", aws_sfn_state_machine.salons_pipeline.arn, { label = "started" }],
              [".", "ExecutionsSucceeded", ".", ".", { label = "succeeded" }],
              [".", "ExecutionsFailed", ".", ".", { label = "failed" }],
              [".", "ExecutionsTimedOut", ".", ".", { label = "timedOut" }],
              [".", "ExecutionsAborted", ".", ".", { label = "aborted" }],
            ]
          }
        },

        # Row 3.2: ExecutionTime avg / max
        {
          type   = "metric"
          x      = 12
          y      = 18
          width  = 12
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = false
            period  = 3600
            region  = local.dashboard_region
            title   = "Execution Time (ms)"
            metrics = [
              ["AWS/States", "ExecutionTime", "StateMachineArn", aws_sfn_state_machine.salons_pipeline.arn, { label = "avg", stat = "Average" }],
              [".", "ExecutionTime", ".", ".", { label = "max", stat = "Maximum" }],
            ]
          }
        },
      ],

      # ------------------------------------------------------------------
      # Row 4: Application metrics (EMF: Akimashita/Scraper)
      # ------------------------------------------------------------------
      [
        {
          type   = "text"
          x      = 0
          y      = 24
          width  = 24
          height = 1
          properties = {
            markdown = "## Application metrics (EMF, namespace `Akimashita/Scraper`)\n各ジョブ完了時に [lib/metrics.ts](https://github.com/) から 1 行 emit。`RecordsProcessed` の意味は stage ごとに異なる (salons: phase ごとの成果合計、therapists: 同期 salon 数、availability: 通知 enqueue 数、notify: 送信成功 row 数)。"
          }
        },

        # Row 4.1: JobDurationMs (avg) per stage
        {
          type   = "metric"
          x      = 0
          y      = 25
          width  = 12
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = false
            period  = 3600
            region  = local.dashboard_region
            title   = "JobDurationMs (avg, hourly)"
            metrics = [
              for s in local.dashboard_stage_order :
              ["Akimashita/Scraper", "JobDurationMs", "Environment", local.dashboard_environment, "Stage", s,
                { label = s, stat = "Average" }
              ]
            ]
          }
        },

        # Row 4.2: RecordsProcessed (sum) per stage
        {
          type   = "metric"
          x      = 12
          y      = 25
          width  = 12
          height = 6
          properties = {
            view    = "timeSeries"
            stacked = false
            period  = 3600
            region  = local.dashboard_region
            title   = "RecordsProcessed (sum, hourly)"
            metrics = [
              for s in local.dashboard_stage_order :
              ["Akimashita/Scraper", "RecordsProcessed", "Environment", local.dashboard_environment, "Stage", s,
                { label = s, stat = "Sum" }
              ]
            ]
          }
        },
      ],
    )
  })
}
