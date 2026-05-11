locals {
  ecr_repo_name = "${var.name_prefix}-scraper"
}

# ----------------------------------------------------------------------------
# ECR: スクレイパー用コンテナイメージリポジトリ
# 全ステージ（therapists / availability / notify）が同一イメージを共有し、
# Lambda 側 image_config.command でハンドラを切り替える。
# ----------------------------------------------------------------------------
resource "aws_ecr_repository" "scraper" {
  name         = local.ecr_repo_name
  force_delete = false

  # 同じタグの再 push を禁止し、デプロイの再現性 / ロールバック安全性を確保。
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  # 誤削除によるイメージ消失（および後続の Lambda デプロイ不能化）を防ぐ。
  lifecycle {
    prevent_destroy = true
  }
}

# untagged を短期で破棄しつつ、タグ付きは直近 N 件のみ保持。
# ECR Always Free 500MB 枠内に収めるための運用ポリシー。
resource "aws_ecr_lifecycle_policy" "scraper" {
  repository = aws_ecr_repository.scraper.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after ${var.ecr_untagged_expire_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.ecr_untagged_expire_days
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the last ${var.ecr_keep_image_count} tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_keep_image_count
        }
        action = { type = "expire" }
      },
    ]
  })
}
