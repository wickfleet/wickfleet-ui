.DEFAULT_GOAL := help
SHELL := bash

PNPM    ?= npx -y pnpm@12.17.0
IMAGE   ?= wickfleet-ui
VERSION ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

##@ General

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nusage: make <target>\n"} \
	  /^[a-zA-Z0-9_.-]+:.*##/ { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 } \
	  /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Development

.PHONY: setup
setup: ## Install dependencies from the lockfile
	$(PNPM) install --frozen-lockfile

.PHONY: build
build: ## Build the static UI into dist/
	$(PNPM) run build

.PHONY: test
test: ## Unit tests (vitest)
	$(PNPM) exec vitest run tests/unit

# vue-tsc needs the declarations vite generates; a clean clone has none.
src/auto-imports.d.ts:
	$(PNPM) run build

.PHONY: lint
lint: src/auto-imports.d.ts ## eslint (no fix) and vue-tsc
	$(PNPM) run lint-ci
	$(PNPM) run typecheck

# "Plot configurator" fails on stock 3.1.3 too; not ours. On a Mac with Chrome:
# make e2e E2E_PROJECT=chromium
E2E_PROJECT ?= chromium-bundled

.PHONY: e2e
e2e: build e2e-run ## Playwright browser tests against the built UI

.PHONY: e2e-run
e2e-run: ## Playwright only, against an existing build (needs no network: the API is mocked)
	CI=true $(PNPM) exec playwright test --project=$(E2E_PROJECT) --retries=0 --reporter=line --grep-invert "Plot configurator"

.PHONY: e2e-live
e2e-live: ## Live smoke test against WICKFLEET_URL as WICKFLEET_E2E_USER (PASSWORD, TOTP otpauth URI); creates and deletes a bot
	@test -n "$$WICKFLEET_URL" || { echo "set WICKFLEET_URL and WICKFLEET_E2E_USER/PASSWORD/TOTP, see WICKFLEET.md" >&2; exit 1; }
	$(PNPM) exec playwright install chromium
	$(PNPM) exec playwright test -c playwright.live.config.ts

.PHONY: fmt
fmt: ## Rewrite files with eslint --fix
	$(PNPM) exec eslint --fix src tests

.PHONY: run
run: ## Vite dev server
	$(PNPM) run dev

##@ Image

.PHONY: image
image: ## Build the nginx image (needs docker)
	docker build --network=host -t $(IMAGE):$(VERSION) .

##@ Housekeeping

.PHONY: clean
clean: ## Remove build output
	rm -rf dist
