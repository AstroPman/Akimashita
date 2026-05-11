output "ecr_repository_name" {
  description = "ECR リポジトリ名"
  value       = aws_ecr_repository.scraper.name
}

output "ecr_repository_url" {
  description = "ECR リポジトリの URL（push 先 / Lambda image_uri のベース）"
  value       = aws_ecr_repository.scraper.repository_url
}

output "ecr_repository_arn" {
  description = "ECR リポジトリの ARN"
  value       = aws_ecr_repository.scraper.arn
}
