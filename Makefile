# =============================================================================
# Terraform 操作ラッパー
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

# .PHONY -------------------------------------------------------------------
.PHONY: help \
        aws-init aws-plan aws-apply aws-destroy aws-fmt aws-validate aws-output aws-console aws-clean \
        bootstrap-init bootstrap-plan bootstrap-apply bootstrap-fmt bootstrap-validate bootstrap-output \
        scraper-image-build scraper-image-push scraper-image-deploy scraper-image-login \
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
	@echo "  scraper-image-deploy  build → push を一気に実行"
	@echo "  scraper-image-login   ECR docker login のみ"
	@echo ""
	@echo "[共通]"
	@echo "  fmt            両方の terraform fmt -recursive を実行"

# -- infra/aws -------------------------------------------------------------
aws-init:
	cd $(AWS_DIR) && terraform init -reconfigure $(AWS_BACKEND_CONFIG)

aws-plan:
	cd $(AWS_DIR) && terraform plan $(AWS_VAR_FILE)

aws-apply:
	cd $(AWS_DIR) && terraform apply $(AWS_VAR_FILE)

aws-destroy:
	cd $(AWS_DIR) && terraform destroy $(AWS_VAR_FILE)

aws-fmt:
	terraform fmt -recursive $(AWS_DIR)

aws-validate:
	cd $(AWS_DIR) && terraform validate

aws-output:
	cd $(AWS_DIR) && terraform output

aws-console:
	cd $(AWS_DIR) && terraform console -var-file=env/$(ENV)/terraform.tfvars

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

# -- 共通 ------------------------------------------------------------------
fmt:
	terraform fmt -recursive $(AWS_DIR) $(BOOTSTRAP_DIR)
