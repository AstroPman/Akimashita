# ============================================================================
# Lambda 実行ロール（3 ステージで共有）
# ============================================================================

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-scraper-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# CloudWatch Logs への書き込み権限（基本セット）。
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SSM SecureString の取得権限（自モジュールで作った Parameter のみ）。
data "aws_iam_policy_document" "lambda_ssm" {
  statement {
    sid     = "ReadScraperParameters"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [
      aws_ssm_parameter.supabase_service_role_key.arn,
      aws_ssm_parameter.resend_api_key.arn,
    ]
  }

  # SSM SecureString は AWS managed key (alias/aws/ssm) で暗号化される。
  # ssm.<region>.amazonaws.com 経由の復号要求のみ許可する条件付きで kms:Decrypt を付ける。
  statement {
    sid       = "DecryptViaSsm"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${data.aws_region.current.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "lambda_ssm" {
  name   = "${var.name_prefix}-scraper-lambda-ssm"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_ssm.json
}

# ============================================================================
# EventBridge Scheduler 実行ロール（Lambda を invoke するため）
# ============================================================================

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name_prefix}-scraper-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  # Scheduler は live エイリアス経由で Lambda を呼ぶため、qualified ARN
  # (function_arn:live) を許可する必要がある。エイリアス ARN は
  # aws_lambda_alias.stage[*].arn から取得する。
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [for a in aws_lambda_alias.stage : a.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "${var.name_prefix}-scraper-scheduler-invoke"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

# ============================================================================
# EventBridge Scheduler 実行ロール（Step Functions を StartExecution するため）
# - assume role は同じ scheduler.amazonaws.com だが、StartExecution の権限を
#   持たせるので Lambda Invoke 用とは別 role に分ける（最小権限）。
# ============================================================================
resource "aws_iam_role" "scheduler_sfn" {
  name               = "${var.name_prefix}-scraper-scheduler-sfn"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_sfn" {
  statement {
    sid       = "StartSalonsPipeline"
    actions   = ["states:StartExecution"]
    resources = [aws_sfn_state_machine.salons_pipeline.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_sfn" {
  name   = "${var.name_prefix}-scraper-scheduler-sfn"
  role   = aws_iam_role.scheduler_sfn.id
  policy = data.aws_iam_policy_document.scheduler_sfn.json
}
