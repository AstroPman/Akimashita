# SecureString Parameter は枠だけ Terraform で作り、値は手動投入する。
#   aws ssm put-parameter \
#     --name /akimashita-staging/scraper/SUPABASE_SERVICE_ROLE_KEY \
#     --type SecureString --value '...' --overwrite
#
# Lambda の environment.variables に注入するため、data source 経由で復号値を読み出す。
# tfstate にも値が入る前提（State バケットは S3 + KMS で保護）。

resource "aws_ssm_parameter" "supabase_service_role_key" {
  name        = "${local.ssm_path_base}/SUPABASE_SERVICE_ROLE_KEY"
  type        = "SecureString"
  value       = "PLACEHOLDER_PLEASE_UPDATE_VIA_CLI"
  description = "Supabase Service Role Key. 値は aws ssm put-parameter --overwrite で手動投入"

  lifecycle {
    ignore_changes  = [value]
    prevent_destroy = true
  }
}

resource "aws_ssm_parameter" "resend_api_key" {
  name        = "${local.ssm_path_base}/RESEND_API_KEY"
  type        = "SecureString"
  value       = "PLACEHOLDER_PLEASE_UPDATE_VIA_CLI"
  description = "Resend API Key（notify ステージで使用）。値は手動投入"

  lifecycle {
    ignore_changes  = [value]
    prevent_destroy = true
  }
}

# === data 読取（with_decryption はデフォルト true） =========================
data "aws_ssm_parameter" "supabase_service_role_key" {
  name = aws_ssm_parameter.supabase_service_role_key.name
}

data "aws_ssm_parameter" "resend_api_key" {
  name = aws_ssm_parameter.resend_api_key.name
}
