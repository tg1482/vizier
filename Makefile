.PHONY: dev build run clean install

# Get the current session ID from Claude history
SESSION_ID := $(shell tail -1 ~/.claude/history.jsonl 2>/dev/null | jq -r '.sessionId' 2>/dev/null || echo "")
PROJECT := $(shell pwd)

dev:
	@if [ -z "$(SESSION_ID)" ]; then \
		echo "Could not detect current session. Listing available sessions:"; \
		ls ~/.claude/projects/-Users-tanmaygupta-dev-vizzy/*.jsonl 2>/dev/null | xargs -n1 basename | sed 's/.jsonl//' | head -5; \
		echo ""; \
		echo "Run with: cargo run -- --session <session-id>"; \
		exit 1; \
	fi
	@echo "Using session: $(SESSION_ID)"
	@echo "Project: $(PROJECT)"
	cargo run -- --session $(SESSION_ID) --project $(PROJECT)

build:
	cargo build --release

run:
	cargo run --release -- --session $(SESSION_ID) --project $(PROJECT)

clean:
	cargo clean

install:
	./install.sh
