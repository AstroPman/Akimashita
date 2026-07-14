# syntax=docker/dockerfile:1.7
#
# Lambda コンテナイメージ（ARM64 / Node.js 22）。
# 全ステージの Lambda Function は同一イメージを共有し、Terraform 側 image_config.command
# でハンドラ（"availability.handler" など）を指定する。
#
# Build context は **repo root** にすること:
#   docker build -t akimashita-scraper -f apps/scraper/Dockerfile .
#
# men-esthe Cloudflare warmup 用に Playwright Chromium を同梱する。
# (@sparticuz/chromium は ARM64 非対応のため使わない)

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


# === Playwright Chromium (must match Lambda TARGETPLATFORM / arm64) ===
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-bookworm AS browsers

WORKDIR /pw
RUN npm init -y && npm install --no-save playwright-core@1.59.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# --with-deps で Debian 側の共有ライブラリ依存も入れる。Lambda 実行時は
# chromium バイナリだけコピーし、AL2023 側にも同等パッケージを入れる。
RUN npx playwright-core install --with-deps chromium


# === Runtime stage ===================================================
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

# Chromium 実行に必要な共有ライブラリ (Amazon Linux 2023 / dnf)
RUN dnf install -y \
      atk \
      at-spi2-atk \
      cups-libs \
      gtk3 \
      libXcomposite \
      libXcursor \
      libXdamage \
      libXext \
      libXi \
      libXrandr \
      libXScrnSaver \
      libXtst \
      pango \
      alsa-lib \
      nss \
      nss-util \
      nspr \
      libdrm \
      mesa-libgbm \
      libxkbcommon \
      libxcb \
    && dnf clean all \
    && rm -rf /var/cache/dnf

COPY --from=builder /build/apps/scraper/dist/ ${LAMBDA_TASK_ROOT}/

# playwright-core は esbuild external。ハンドラ隣の node_modules から解決する。
COPY --from=builder /build/node_modules/playwright-core ${LAMBDA_TASK_ROOT}/node_modules/playwright-core

COPY --from=browsers /ms-playwright /opt/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

# Lambda base に findutils が無いので glob でフル Chromium を特定する。
RUN set -eu; \
    linked=""; \
    for c in /opt/ms-playwright/chromium-*/chrome-linux*/chrome; do \
      if [ -f "$c" ]; then ln -sf "$c" /opt/chromium; linked="$c"; break; fi; \
    done; \
    if [ -z "$linked" ]; then \
      for c in /opt/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell; do \
        if [ -f "$c" ]; then ln -sf "$c" /opt/chromium; linked="$c"; break; fi; \
      done; \
    fi; \
    test -n "$linked"; \
    echo "Linked Chromium: $linked -> /opt/chromium"
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/chromium

# デフォルトは availability ハンドラ。各 Lambda Function は Terraform の
# aws_lambda_function.image_config.command で上書きする。
CMD ["availability.handler"]
