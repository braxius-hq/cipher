#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -e

echo "⚡ Cipher — Encrypted. Private. Yours."
echo ""

# Determine OS and Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Linux" ]; then
    echo "Error: This install script currently only supports Linux."
    exit 1
fi

if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then
    DL_ARCH="amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    DL_ARCH="arm64"
else
    echo "Error: Unsupported architecture $ARCH."
    exit 1
fi

REPO="braxius-hq/cipher"
BINARY_PATTERN="cipher-.*-linux-${DL_ARCH}"
INSTALL_DIR="/usr/local/bin"

echo "Installing latest release..."
LATEST_URL=$(curl -s https://api.github.com/repos/$REPO/releases/latest | grep "browser_download_url" | grep -E "$BINARY_PATTERN" | cut -d '"' -f 4 | head -n 1)

if [ -z "$LATEST_URL" ]; then
    echo "Error: Could not find latest release for Linux."
    exit 1
fi

curl -sL -o cipher "$LATEST_URL"

chmod +x cipher
echo "Copying to $INSTALL_DIR (requires sudo)..."
sudo mv cipher "$INSTALL_DIR/cipher"

echo ""
echo "✅ Cipher installed."
echo "Run 'cipher' to get started."