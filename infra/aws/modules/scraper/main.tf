data "aws_region" "current" {}

locals {
  ecr_repo_name = "${var.name_prefix}-scraper"

  # SSM Parameter Store のパス。例: /akimashita-staging/scraper/SUPABASE_SERVICE_ROLE_KEY
  ssm_path_base = "/${var.name_prefix}/scraper"

  # 各ステージの Lambda 設定。新ステージを追加したい場合はここに 1 行足すだけで
  # Lambda + Log Group + Alarm が一式生える。
  # 注意: salons は Step Functions と単独 Schedule の両方から呼ばれるため、
  # 既存の `aws_scheduler_schedule.stage` (var.schedules map で制御) からは
  # 意図的に除外する。詳細は scheduler.tf / stepfunctions.tf を参照。
  stages = {
    salons = {
      handler            = "salons.handler"
      # Playwright Chromium で men-esthe CF warmup するため 2048MB。
      # 日次数回の短時間起動なので GB-秒は Always Free 枠内に収まる想定。
      memory_mb          = 2048
      timeout_seconds    = 900
      log_retention_days = 14
    }
    therapists = {
      handler            = "therapists.handler"
      memory_mb          = 256
      timeout_seconds    = 900
      log_retention_days = 14
    }
    availability = {
      handler = "availability.handler"
      # 1024MB に増量。Lambda は memory に比例して vCPU が割り当てられる仕様
      # (256MB ≒ 0.16 vCPU, 1024MB ≒ 0.6 vCPU) のため、cheerio パース・gzip
      # 解凍・TLS ハンドシェイクなど CPU bound な処理が速くなる。
      # 旧設定 (256MB) では Max Memory Used が 253MB に達し OOM 寸前だった点も解消。
      # GB-秒換算でも所要時間が短くなれば課金は同等以下に収まる。
      memory_mb          = 1024
      timeout_seconds    = 900
      log_retention_days = 14
    }
    # availability_research: salons.research_enabled = true 配下のセラピストだけを
    # 回す研究モード専用 Lambda。本流の availability とは別 Schedule・別関数で動かし、
    # watch ユーザの 1 分通知ループを阻害しない設計。
    # 実測 (caskan 133 人 / grow 137 人) で 1 ジョブ約 3〜6 分かかるため timeout は 900s。
    # caskan は cheerio パースでメモリ ~450MB まで使う観測がある点も考慮し 1024MB に揃える。
    availability_research = {
      handler            = "availability_research.handler"
      memory_mb          = 1024
      timeout_seconds    = 900
      log_retention_days = 14
    }
    # official_shifts: 公式サイト個別ページから「シフト時間範囲」だけを取得し、
    # 予約サイトに先行して shift_announced 通知を出す Layer 2 ジョブ。
    # watch_settings 配下のセラピストのみが対象なので件数は小さく (典型 < 100),
    # cheerio で軽い HTML パースを行うのみのため availability より控えめのメモリで足りる。
    official_shifts = {
      handler            = "official_shifts.handler"
      memory_mb          = 512
      timeout_seconds    = 600
      log_retention_days = 14
    }
    notify = {
      handler            = "notify.handler"
      memory_mb          = 256
      timeout_seconds    = 300
      log_retention_days = 14
    }
  }
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
