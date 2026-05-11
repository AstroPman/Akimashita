terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.44.0"
    }
  }

  # 環境ごとに backend 設定を切り替えるため、ここでは partial backend config として
  # 空ブロックだけ宣言する。具体値は `terraform init -backend-config=env/<env>/backend.hcl`
  # で外部から注入する（Makefile 経由が前提）。
  backend "s3" {}
}
