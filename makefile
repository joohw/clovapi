FRONTEND_DIR = ./web-next
BACKEND_DIR = .

.PHONY: all install-frontend dev-frontend build-frontend start-backend

all: build-frontend start-backend

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd $(FRONTEND_DIR) && bun install

dev-frontend:
	@echo "Starting Next.js frontend dev server..."
	@cd $(FRONTEND_DIR) && bun run dev

build-frontend:
	@echo "Building Next.js frontend..."
	@cd $(FRONTEND_DIR) && bun install && bun run build

start-backend:
	@echo "Starting backend dev server..."
	@cd $(BACKEND_DIR) && go run main.go &
