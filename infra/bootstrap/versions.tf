terraform {
  required_version = ">= 1.15.2"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.44.0"
    }
  }

  # bootstrap は「バックエンドそのもの」を作る層なので
  # 自分自身は local backend を使う（terraform.tfstate はローカル管理／Git 管理外）。
}
