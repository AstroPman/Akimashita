# ============================================================================
# GitHub Actions OIDC Provider + Deploy Role
#
# AWS アカウントは KoppePan 1 つだけなので、scraper のデプロイ用 IAM Role は
# staging / production 共通でこの 1 本にする。リソース ARN は
#   - ECR:    akimashita-*-scraper
#   - Lambda: akimashita-*-scraper-* (関数本体 + qualified ARN)
# のワイルドカードで括り、後続環境の追加でロール側の更新を不要にする。
#
# CI 側は GitHub Repository Variable AWS_DEPLOY_ROLE_ARN にこのロール ARN を
# 1 本登録するだけで、main push の自動デプロイから assume できるようになる。
# ============================================================================

locals {
  github_owner = "AstroPman"
  github_repo  = "Akimashita"
  region       = "ap-northeast-1"

  # scraper の Lambda 関数名は akimashita-<env>-<stage> (Terraform の
  # ${var.name_prefix}-${each.key} に揃えてある)。ECR と異なり "-scraper" は
  # 入らない。staging / production を 1 ロールでカバーするため
  # 環境部分のみ wildcard にし、stage 名で絞り込む。
  scraper_lambda_stages = ["salons", "therapists", "availability", "notify"]
}

data "aws_caller_identity" "current" {}

# Provider はアカウント単位で 1 つしか作れない。一度作れば
# infra/aws 側からも data ソースで参照できる。
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# main ブランチからの push と、後で追加する GitHub Environment(staging/production)
# どちらでも assume できるように sub を 2 系統許可する。
data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_owner}/${local.github_repo}:ref:refs/heads/main",
        "repo:${local.github_owner}/${local.github_repo}:environment:*",
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "akimashita-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json
}

# scraper の ECR / Lambda にだけ触れるポリシー。
# リソース ARN を akimashita-*-scraper / akimashita-*-scraper-* のワイルドカードで
# 括り、staging / production 双方をこの 1 ロールでまかなう。
data "aws_iam_policy_document" "github_deploy" {
  # ECR ログイン用。GetAuthorizationToken は resource = "*" のみ許容される。
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPushScraperImages"
    actions = [
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [
      "arn:aws:ecr:${local.region}:${data.aws_caller_identity.current.account_id}:repository/akimashita-*-scraper",
    ]
  }

  statement {
    sid = "LambdaUpdateScraper"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:PublishVersion",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateAlias",
      "lambda:GetAlias",
    ]
    # 関数本体 + qualified ARN(alias/version 指定) を、stage 名で限定して列挙する。
    # 例: arn:aws:lambda:ap-northeast-1:<acct>:function:akimashita-staging-salons[:live]
    resources = concat(
      [for s in local.scraper_lambda_stages :
        "arn:aws:lambda:${local.region}:${data.aws_caller_identity.current.account_id}:function:akimashita-*-${s}"
      ],
      [for s in local.scraper_lambda_stages :
        "arn:aws:lambda:${local.region}:${data.aws_caller_identity.current.account_id}:function:akimashita-*-${s}:*"
      ],
    )
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "akimashita-github-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
