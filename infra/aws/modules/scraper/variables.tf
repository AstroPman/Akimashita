variable "name_prefix" {
  description = "リソース名プレフィックス（例: akimashita-staging）。ルートモジュールから渡す。"
  type        = string
}

variable "ecr_keep_image_count" {
  description = "ECR に保持するタグ付きイメージの最大数。古いものから自動削除。"
  type        = number
  default     = 10
}

variable "ecr_untagged_expire_days" {
  description = "untagged イメージを削除するまでの日数。"
  type        = number
  default     = 7
}
