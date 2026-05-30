.PHONY: all web build clean dev-web dev-serve dev-export copy-vault-data release

BINARY    := obsidianator
TEST_VAULT := data/test
DIST      := dist
LDFLAGS   := -ldflags="-s -w"

all: web build

# Build the Vite frontend into ./static
web:
	cd web && pnpm install && pnpm build

# Build the Go binary (embeds ./static); strip debug info for smaller binary
build:
	go build $(LDFLAGS) -o $(BINARY) .

# Clean build artifacts
clean:
	rm -rf $(BINARY) $(DIST) static/assets static/index.html release/

# Run Vite dev server (requires vault-data.json in web/public/)
dev-web:
	cd web && pnpm dev

# Serve test vault directly in-memory (no disk output) with live reload
dev-serve: build
	./$(BINARY) serve $(TEST_VAULT) --watch --port 3000

# Export test vault, watch for changes, and serve at localhost:3000
dev-export: build
	./$(BINARY) export $(TEST_VAULT) --output $(DIST) --watch --port 3000

# Copy vault-data.json to web/public/ for Vite dev server
copy-vault-data: build
	./$(BINARY) export $(TEST_VAULT) --output $(DIST)
	cp $(DIST)/vault-data.json web/public/vault-data.json

install: web build
	go install .

# Cross-compile release binaries (stripped)
release: web
	mkdir -p release
	GOOS=linux   GOARCH=amd64 go build $(LDFLAGS) -o release/$(BINARY)-linux-amd64 .
	GOOS=darwin  GOARCH=amd64 go build $(LDFLAGS) -o release/$(BINARY)-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64 go build $(LDFLAGS) -o release/$(BINARY)-darwin-arm64 .
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o release/$(BINARY)-windows-amd64.exe .
