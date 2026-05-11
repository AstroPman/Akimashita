provider "aws" {
  region = "ap-northeast-1"

  # 誤適用防止：KoppePan アカウント以外では apply を弾く。
  allowed_account_ids = ["695668793500"]

  default_tags {
    tags = {
      Project     = "akimashita"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}
