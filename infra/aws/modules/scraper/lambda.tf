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
#
# image_uri は Terraform 管理外（CI/CD が aws lambda update-function-code で
# 上書きする）。ignore_changes で常時無視し、Terraform 側の var.image_tag は
# 「初回 apply 時のブート値」としてのみ機能する。
#
# publish = true により、コードまたは設定が更新された瞬間に新バージョンが
# publish される。エイリアス live は CI 側で update-alias して付け替える。
# ============================================================================
resource "aws_lambda_function" "stage" {
  for_each = local.stages

  function_name = "${var.name_prefix}-${each.key}"
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.scraper.repository_url}:${var.image_tag}"
  architectures = ["arm64"]

  publish = true

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

      # 環境識別子。lib/metrics.ts (EMF) が CloudWatch dimension に焼き込み、
      # ダッシュボード Row 4 (Akimashita/Scraper namespace) で
      # production / staging を区別するために使う。
      # name_prefix が "akimashita-<env>" 形式である前提でパースして取り出す。
      SCRAPER_ENVIRONMENT = split("-", var.name_prefix)[1]

      # 秘密値（SSM SecureString を data source で復号取得して直接注入）
      SUPABASE_SERVICE_ROLE_KEY = data.aws_ssm_parameter.supabase_service_role_key.value
      RESEND_API_KEY            = data.aws_ssm_parameter.resend_api_key.value

      # ============================================================
      # Stage 3 (availability) パフォーマンスチューニング
      # ============================================================
      # ローカル実測 (caskan 12 + edc 4 + estama 1 + grow 1 = 18 人) で
      # baseline 34s → 4.3s (-87%) を達成した「攻めセット」を採用。
      # 全 Lambda 共通で注入するが、AVAILABILITY_CONCURRENCY 等は他ステージでは
      # 単に無視されるだけなのでステージ別に分ける必要はない。
      #
      # ホスト負荷の手加減は HostQueue (lib/http.ts) が同一ホスト内で
      # concurrency 接続だけ並列化 + min/max delay を必ず挟む形で保たれる。
      # 攻めすぎたら 429/5xx → 指数バックオフで自動的に減速する。
      AVAILABILITY_CONCURRENCY        = "16"
      SCRAPER_HTTP_CONCURRENCY_CASKAN = "3"
      SCRAPER_HTTP_CONCURRENCY_EDC    = "2"
      SCRAPER_HTTP_CONCURRENCY_GROW   = "3" # grow-appt.com 単一ホスト + 監視多数のため
      MIN_DELAY_MS                    = "200"
      MAX_DELAY_MS                    = "500"

      # ============================================================
      # Stage 5 (official_shifts) パフォーマンスチューニング
      # ============================================================
      # 公式サイトはサロン単位で別ホストが多いため並列度を上げてもホスト負荷は
      # HostQueue で守られる。watch 監視対象セラピストは典型数十名規模のため、
      # 並列 8 で 1 分以内に収まる想定。
      OFFICIAL_SHIFTS_CONCURRENCY = "8"
    }
  }

  # CI が新イメージを push して update-function-code を打つたびに drift が
  # 出てしまうため、image_uri の変更は Terraform 側で無視する。
  lifecycle {
    ignore_changes = [image_uri]
  }

  # Log Group を Lambda 自動作成に任せると Terraform 管理外になるため、
  # 必ず先に Log Group が存在する状態で Lambda を作る。
  depends_on = [
    aws_cloudwatch_log_group.stage,
    aws_iam_role_policy.lambda_ssm,
    aws_iam_role_policy_attachment.lambda_basic,
  ]
}

# ============================================================================
# Lambda Alias: live
#
# 全ての呼び出し元（EventBridge Scheduler / Step Functions / CloudWatch Alarm）は
# この alias ARN（= function_arn:live）を参照する。CI が新バージョンを publish
# したら update-alias で live を新バージョンに付け替えるだけで切替が完了する。
#
# function_version も image_uri 同様 CI が触るため ignore_changes で無視する。
# 初回 apply 時には Terraform が publish した直後のバージョンが採用される。
# ============================================================================
resource "aws_lambda_alias" "stage" {
  for_each = local.stages

  name             = "live"
  function_name    = aws_lambda_function.stage[each.key].function_name
  function_version = aws_lambda_function.stage[each.key].version
  description      = "Production traffic alias updated by CI/CD"

  lifecycle {
    ignore_changes = [function_version]
  }
}
