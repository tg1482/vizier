.PHONY: dev build install clean

PROJECT := $(shell pwd)

dev:
	bun run src/index.tsx -- --project $(PROJECT)

build:
	bun build src/index.tsx --outdir dist --target bun

install:
	bun link

clean:
	rm -rf dist node_modules
