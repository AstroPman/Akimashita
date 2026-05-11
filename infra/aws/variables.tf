variable "environment" {
  description = "デプロイ環境。default_tags の Environment や、リソース名のサフィックスに利用する。env/<env>/terraform.tfvars 経由で必ず指定する。"
  type        = string

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment は production または staging のいずれかを指定してください。"
  }
}
