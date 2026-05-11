# ============================================================================
# CloudWatch Log Group（ステージごと、Lambda が自動作成するのを抑止）
# ============================================================================
resource "aws_cloudwatch_log_group" "stage" {
  for_each = local.stages

  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = each.value.log_retention_days
}

# ============================================================================
# Lambda Function（コンテナイメージ、ハンドラはイメージ内 CMD で切り替え）
# ============================================================================
resource "aws_lambda_function" "stage" {
  for_each = local.stages

  function_name = "${var.name_prefix}-${each.key}"
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.scraper.repository_url}:${var.image_tag}"
  architectures = ["arm64"]

  memory_size = each.value.memory_mb
  timeout     = each.value.timeout_seconds
  role        = aws_iam_role.lambda.arn

  image_config {
    command = [each.value.handler]
  }

  environment {
    variables = {
      # 公開情報
      SUPABASE_URL = var.supabase_url
      EMAIL_FROM   = var.email_from
      APP_BASE_URL = var.app_base_url

      # 秘密値（SSM SecureString を data source で復号取得して直接注入）
      SUPABASE_SERVICE_ROLE_KEY = data.aws_ssm_parameter.supabase_service_role_key.value
      RESEND_API_KEY            = data.aws_ssm_parameter.resend_api_key.value
    }
  }

  # Log Group を Lambda 自動作成に任せると Terraform 管理外になるため、
  # 必ず先に Log Group が存在する状態で Lambda を作る。
  depends_on = [
    aws_cloudwatch_log_group.stage,
    aws_iam_role_policy.lambda_ssm,
    aws_iam_role_policy_attachment.lambda_basic,
  ]
}
