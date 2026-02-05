#!/usr/bin/env bash
set -e

echo "Building vizzy..."
cargo build --release

echo "Installing to ~/.local/bin..."
mkdir -p ~/.local/bin
cp target/release/vizzy ~/.local/bin/

echo ""
echo "✓ Vizzy installed!"
echo ""
echo "Add ~/.local/bin to your PATH if not already:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo ""
echo "Then run: vizzy"
