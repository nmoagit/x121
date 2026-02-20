MANIFEST := --manifest-path apps/backend/Cargo.toml

.PHONY: build check clippy test fmt fmt-check dev install lint typecheck test-frontend storybook migrate reset-db

# --- Backend (Rust) ---

build:
	cargo build $(MANIFEST)

check:
	cargo check $(MANIFEST)

clippy:
	cargo clippy $(MANIFEST) --workspace --all-targets -- -D warnings

test:
	cargo test $(MANIFEST) --workspace

fmt:
	cargo fmt $(MANIFEST) --all

fmt-check:
	cargo fmt $(MANIFEST) --all -- --check

# --- Frontend (React/TypeScript) ---

dev:
	cd apps/frontend && pnpm dev

install:
	cd apps/frontend && pnpm install

lint:
	cd apps/frontend && pnpm lint

typecheck:
	cd apps/frontend && pnpm exec tsc --noEmit

test-frontend:
	cd apps/frontend && pnpm test

storybook:
	cd apps/frontend && pnpm storybook

# --- Database ---

migrate:
	sqlx migrate run --source apps/db/migrations/

reset-db:
	./scripts/reset-db.sh
