# ============================================================================
# Step Functions: salons-pipeline
#
# salons ステージのサブフェーズ (discover → details → bookings → link) を
# 直列に実行するためのワークフロー。Lambda 1 本 (salons.handler) を
# Payload.phase 違いで 4 回呼ぶだけのシンプルな構成。
#
# areas は別系統 (月 1 回・単独 Schedule から Lambda 直接呼び出し) で
# 動かすため、このパイプラインには含めない。
# ============================================================================

locals {
  salons_lambda_arn = aws_lambda_function.stage["salons"].arn

  # Lambda Invoke の各 Task で共通利用する Retry 設定。
  # スクレイピング側で transient な fetch 失敗 / Supabase 一時障害が起き得るため、
  # 軽くリトライしてから諦める方針。指数バックオフで合計 ~90 秒程度の遅延。
  salons_pipeline_retry = [{
    ErrorEquals     = ["States.ALL"]
    IntervalSeconds = 30
    MaxAttempts     = 2
    BackoffRate     = 2.0
  }]

  salons_pipeline_phases = ["discover", "details", "bookings", "link"]
}

# ----------------------------------------------------------------------------
# Step Functions 実行ロール
# - salons Lambda の InvokeFunction のみ
# - CloudWatch Logs への書き込み（StateMachine 用 Log Group）
# ----------------------------------------------------------------------------
data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn_salons_pipeline" {
  name               = "${var.name_prefix}-scraper-sfn-salons"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

data "aws_iam_policy_document" "sfn_salons_pipeline_invoke" {
  statement {
    sid       = "InvokeSalonsLambda"
    actions   = ["lambda:InvokeFunction"]
    resources = [local.salons_lambda_arn]
  }

  # Step Functions が CloudWatch Logs に実行ログを流すためのパーミッション。
  # Log Group ARN ベースでの絞り込みが効きづらいリソース (kinesis/firehose 系)
  # を含むため、AWS 公式ドキュメント踏襲で resources = ["*"]。
  statement {
    sid = "DeliverLogs"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn_salons_pipeline" {
  name   = "${var.name_prefix}-scraper-sfn-salons"
  role   = aws_iam_role.sfn_salons_pipeline.id
  policy = data.aws_iam_policy_document.sfn_salons_pipeline_invoke.json
}

# ----------------------------------------------------------------------------
# CloudWatch Log Group（Step Functions 実行ログ）
# ----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "sfn_salons_pipeline" {
  name              = "/aws/states/${var.name_prefix}-salons-pipeline"
  retention_in_days = 14
}

# ----------------------------------------------------------------------------
# Step Functions State Machine
# - Standard ワークフロー: 1 日 1 回起動・実行時間 ~数分〜十数分を想定
# - 各 Task は Lambda Invoke で Payload.phase を固定し、前段の出力は次段に渡さない
#   (ResultPath = null で入力をそのまま下流に伝播)
# ----------------------------------------------------------------------------
resource "aws_sfn_state_machine" "salons_pipeline" {
  name     = "${var.name_prefix}-salons-pipeline"
  type     = "STANDARD"
  role_arn = aws_iam_role.sfn_salons_pipeline.arn

  definition = jsonencode({
    Comment = "Run salons sub-phases (discover -> details -> bookings -> link) in series."
    StartAt = "discover"
    States = {
      discover = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.salons_lambda_arn
          Payload      = { phase = "discover" }
        }
        Retry      = local.salons_pipeline_retry
        ResultPath = null
        Next       = "details"
      }
      details = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.salons_lambda_arn
          Payload      = { phase = "details" }
        }
        Retry      = local.salons_pipeline_retry
        ResultPath = null
        Next       = "bookings"
      }
      bookings = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.salons_lambda_arn
          Payload      = { phase = "bookings" }
        }
        Retry      = local.salons_pipeline_retry
        ResultPath = null
        Next       = "link"
      }
      link = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = local.salons_lambda_arn
          Payload      = { phase = "link" }
        }
        Retry      = local.salons_pipeline_retry
        ResultPath = null
        End        = true
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn_salons_pipeline.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  depends_on = [
    aws_iam_role_policy.sfn_salons_pipeline,
  ]
}
