# syntax=docker/dockerfile:1.7
#
# Lambda コンテナイメージ（ARM64 / Node.js 22）。
# 全ステージの Lambda Function は同一イメージを共有し、Terraform 側 image_config.command
# でハンドラ（"availability.handler" など）を指定する。
#
# Build context は **repo root** にすること:
#   docker build -t akimashita-scraper -f apps/scraper/Dockerfile .

ARG NODE_VERSION=22

# === Build stage =====================================================
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm AS builder

WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/scraper/package.json ./apps/scraper/

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/scraper ./apps/scraper

RUN npm run build --workspace scraper


# === Runtime stage ===================================================
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

COPY --from=builder /build/apps/scraper/dist/ ${LAMBDA_TASK_ROOT}/

# デフォルトは availability ハンドラ。各 Lambda Function は Terraform の
# aws_lambda_function.image_config.command で上書きする。
CMD ["availability.handler"]
