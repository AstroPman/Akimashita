# =============================================================================
# Terraform 操作 + scraper コンテナ デプロイ ラッパー
#
# infra/aws は環境（production / staging）で backend と tfvars を切り替えて
# 実行する。アカウントは同一なので、State キーと variables の差し替えだけで分離する。
#
# 使い方:
#   make aws-init ENV=staging
#   make aws-plan ENV=staging
#   make aws-apply ENV=production
#
# bootstrap は環境横断（shared）なので ENV 指定不要。
#   make bootstrap-init
#   make bootstrap-apply
#
# -----------------------------------------------------------------------------
# 初回セットアップ（チェックリスト）
# -----------------------------------------------------------------------------
# 1. make bootstrap-init && make bootstrap-apply
#    → S3 (state) + GitHub OIDC Provider + akimashita-github-deploy Role を作成
#    → terraform output github_deploy_role_arn の値を控える
# 2. GitHub: Settings > Secrets and variables > Actions > Variables に
#    AWS_DEPLOY_ROLE_ARN = <手順 1 の Role ARN> を登録
# 3. make scraper-image-deploy ENV=staging
#    → 初版イメージを ECR に push（terraform apply で参照される）
# 4. make aws-init ENV=staging && make aws-apply ENV=staging
#    → Lambda(publish=true) と alias 'live' を作成
# 5. main へ push する or workflow_dispatch で
#    .github/workflows/scraper-deploy-staging.yml を起動
#    → 以降は scraper-deploy ターゲットが build → push → alias 切替まで自動化
# =============================================================================

# -- 環境定義 --------------------------------------------------------------
ENV ?= staging
VALID_ENVS := production staging

ifeq ($(filter $(ENV),$(VALID_ENVS)),)
$(error ENV must be one of [$(VALID_ENVS)] (got "$(ENV)"))
endif

# -- パス定義 --------------------------------------------------------------
AWS_DIR       := infra/aws
BOOTSTRAP_DIR := infra/bootstrap

AWS_BACKEND_CONFIG := -backend-config=env/$(ENV)/backend.hcl
AWS_VAR_FILE       := -var-file=env/$(ENV)/terraform.tfvars

# -- スクレイパーイメージ定義 ---------------------------------------------
AWS_REGION         := ap-northeast-1
SCRAPER_REPO_NAME  := akimashita-$(ENV)-scraper
SCRAPER_PLATFORM   := linux/arm64
SCRAPER_IMAGE_TAG  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

# Lambda が参照するイメージタグを Terraform に渡す。
# 初回 apply 時のみ image_uri に反映される（以後は ignore_changes で無視され、
# CI/CD が aws lambda update-function-code で上書きする運用）。
AWS_VAR_IMAGE_TAG  := -var=scraper_image_tag=$(SCRAPER_IMAGE_TAG)

# -- スクレイパー Lambda デプロイ定義 -------------------------------------
# 全ステージ共通のエイリアス名。CI が新バージョンに付け替える対象。
SCRAPER_LAMBDA_ALIAS  := live
SCRAPER_LAMBDA_PREFIX := akimashita-$(ENV)-scraper
SCRAPER_LAMBDA_STAGES := salons therapists availability notify

# .PHONY -------------------------------------------------------------------
.PHONY: help \
        aws-init aws-plan aws-apply aws-destroy aws-fmt aws-validate aws-output aws-console aws-clean \
        bootstrap-init bootstrap-plan bootstrap-apply bootstrap-fmt bootstrap-validate bootstrap-output \
        scraper-image-build scraper-image-push scraper-image-deploy scraper-image-login \
        scraper-lambda-update scraper-deploy \
        fmt

# -- help ------------------------------------------------------------------
help:
	@echo "Usage: make <target> [ENV=production|staging]"
	@echo ""
	@echo "[infra/aws]  current ENV=$(ENV)  (override: ENV=production)"
	@echo "  aws-init       terraform init -reconfigure (backend を env/$(ENV)/backend.hcl で初期化)"
	@echo "  aws-plan       terraform plan  (var-file=env/$(ENV)/terraform.tfvars)"
	@echo "  aws-apply      terraform apply (var-file=env/$(ENV)/terraform.tfvars)"
	@echo "  aws-destroy    terraform destroy"
	@echo "  aws-fmt        terraform fmt -recursive"
	@echo "  aws-validate   terraform validate"
	@echo "  aws-output     terraform output"
	@echo "  aws-console    terraform console"
	@echo "  aws-clean      .terraform/ を削除（環境切替時に使う）"
	@echo ""
	@echo "[infra/bootstrap] (環境横断・ENV不要)"
	@echo "  bootstrap-init       terraform init"
	@echo "  bootstrap-plan       terraform plan"
	@echo "  bootstrap-apply      terraform apply"
	@echo "  bootstrap-fmt        terraform fmt -recursive"
	@echo "  bootstrap-validate   terraform validate"
	@echo "  bootstrap-output     terraform output"
	@echo ""
	@echo "[scraper image]  current ENV=$(ENV)  TAG=$(SCRAPER_IMAGE_TAG)"
	@echo "  scraper-image-build   apps/scraper を docker build (--platform=$(SCRAPER_PLATFORM))"
	@echo "  scraper-image-push    ECR にログインして tag + push (build を含まない)"
	@echo "  scraper-image-deploy  build → push を一気に実行 (Lambda は更新しない)"
	@echo "  scraper-image-login   ECR docker login のみ"
	@echo ""
	@echo "[scraper deploy]  current ENV=$(ENV)  TAG=$(SCRAPER_IMAGE_TAG)  ALIAS=$(SCRAPER_LAMBDA_ALIAS)"
	@echo "  scraper-lambda-update 既に push 済みの <TAG> を全ステージ Lambda に反映 + alias を新版へ付け替え"
	@echo "  scraper-deploy        build → push → Lambda 更新 → alias 切替を一気通貫で実行 (CI でも使用)"
	@echo ""
	@echo "[共通]"
	@echo "  fmt            両方の terraform fmt -recursive を実行"

# -- infra/aws -------------------------------------------------------------
aws-init:
	cd $(AWS_DIR) && terraform init -reconfigure $(AWS_BACKEND_CONFIG)

aws-plan:
	cd $(AWS_DIR) && terraform plan $(AWS_VAR_FILE) $(AWS_VAR_IMAGE_TAG)

aws-apply:
	cd $(AWS_DIR) && terraform apply $(AWS_VAR_FILE) $(AWS_VAR_IMAGE_TAG)

aws-destroy:
	cd $(AWS_DIR) && terraform destroy $(AWS_VAR_FILE) $(AWS_VAR_IMAGE_TAG)

aws-fmt:
	terraform fmt -recursive $(AWS_DIR)

aws-validate:
	cd $(AWS_DIR) && terraform validate

aws-output:
	cd $(AWS_DIR) && terraform output

aws-console:
	cd $(AWS_DIR) && terraform console $(AWS_VAR_FILE) $(AWS_VAR_IMAGE_TAG)

aws-clean:
	rm -rf $(AWS_DIR)/.terraform

# -- infra/bootstrap -------------------------------------------------------
bootstrap-init:
	cd $(BOOTSTRAP_DIR) && terraform init

bootstrap-plan:
	cd $(BOOTSTRAP_DIR) && terraform plan

bootstrap-apply:
	cd $(BOOTSTRAP_DIR) && terraform apply

bootstrap-fmt:
	terraform fmt -recursive $(BOOTSTRAP_DIR)

bootstrap-validate:
	cd $(BOOTSTRAP_DIR) && terraform validate

bootstrap-output:
	cd $(BOOTSTRAP_DIR) && terraform output

# -- scraper image build & push -------------------------------------------
# 注意: ENV ごとに ECR リポジトリが分かれる（akimashita-<env>-scraper）。
# AWS_ACCOUNT_ID は STS から動的取得し、Makefile にハードコードしない。

scraper-image-build:
	docker build \
	  --platform $(SCRAPER_PLATFORM) \
	  --provenance=false \
	  --sbom=false \
	  -t $(SCRAPER_REPO_NAME):$(SCRAPER_IMAGE_TAG) \
	  -f apps/scraper/Dockerfile .

scraper-image-login:
	@AWS_ACCOUNT_ID=$$(aws sts get-caller-identity --query Account --output text); \
	REGISTRY=$$AWS_ACCOUNT_ID.dkr.ecr.$(AWS_REGION).amazonaws.com; \
	echo "Logging in to $$REGISTRY ..."; \
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $$REGISTRY

scraper-image-push:
	@AWS_ACCOUNT_ID=$$(aws sts get-caller-identity --query Account --output text); \
	REGISTRY=$$AWS_ACCOUNT_ID.dkr.ecr.$(AWS_REGION).amazonaws.com; \
	REMOTE=$$REGISTRY/$(SCRAPER_REPO_NAME):$(SCRAPER_IMAGE_TAG); \
	echo "Logging in to $$REGISTRY ..."; \
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $$REGISTRY; \
	echo "Tagging $(SCRAPER_REPO_NAME):$(SCRAPER_IMAGE_TAG) -> $$REMOTE"; \
	docker tag $(SCRAPER_REPO_NAME):$(SCRAPER_IMAGE_TAG) $$REMOTE; \
	echo "Pushing $$REMOTE ..."; \
	docker push $$REMOTE; \
	echo ""; \
	echo "Pushed: $$REMOTE"

scraper-image-deploy: scraper-image-build scraper-image-push

# -- scraper Lambda update (alias live を新バージョンへ付け替え) ----------
# 前提: scraper-image-push 等で <SCRAPER_IMAGE_TAG> が既に ECR に push されていること。
# 各ステージごとに以下を直列実行する:
#   1. update-function-code --publish で新バージョンを発行
#   2. wait function-updated で配備完了を待つ
#   3. update-alias で live を新バージョンに付け替え
# 失敗したステージで止めるため `set -e` 相当を Makefile シェルで効かせる。

scraper-lambda-update:
	@AWS_ACCOUNT_ID=$$(aws sts get-caller-identity --query Account --output text); \
	REGISTRY=$$AWS_ACCOUNT_ID.dkr.ecr.$(AWS_REGION).amazonaws.com; \
	IMAGE_URI=$$REGISTRY/$(SCRAPER_REPO_NAME):$(SCRAPER_IMAGE_TAG); \
	echo "Updating Lambdas in ENV=$(ENV) to $$IMAGE_URI"; \
	for stage in $(SCRAPER_LAMBDA_STAGES); do \
	  FN=$(SCRAPER_LAMBDA_PREFIX)-$$stage; \
	  echo ""; \
	  echo "==> $$FN: update-function-code --publish"; \
	  VERSION=$$(aws lambda update-function-code \
	    --function-name $$FN \
	    --image-uri $$IMAGE_URI \
	    --publish \
	    --query Version --output text) || exit 1; \
	  echo "==> $$FN: wait function-updated (v$$VERSION)"; \
	  aws lambda wait function-updated --function-name $$FN || exit 1; \
	  echo "==> $$FN: update-alias $(SCRAPER_LAMBDA_ALIAS) -> v$$VERSION"; \
	  aws lambda update-alias \
	    --function-name $$FN \
	    --name $(SCRAPER_LAMBDA_ALIAS) \
	    --function-version $$VERSION >/dev/null || exit 1; \
	done; \
	echo ""; \
	echo "Done. All stages now serving version above on alias '$(SCRAPER_LAMBDA_ALIAS)'."

# build → push → 全ステージの Lambda を新版に切り替えまで一気通貫。
# GitHub Actions (.github/workflows/scraper-deploy-staging.yml) からも同じターゲットを呼ぶ。
scraper-deploy: scraper-image-build scraper-image-push scraper-lambda-update

# -- 共通 ------------------------------------------------------------------
fmt:
	terraform fmt -recursive $(AWS_DIR) $(BOOTSTRAP_DIR)
