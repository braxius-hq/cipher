#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -e

echo "⚡ Cipher — Encrypted. Private. Yours."
echo ""

# Determine OS and Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
	Linux)
		if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then
			BINARY_PATTERN="cipher-.*-linux-amd64"
		elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
			BINARY_PATTERN="cipher-.*-linux-arm64"
		else
			echo "Error: Unsupported architecture $ARCH."
			exit 1
		fi
		;;
	Darwin)
		if [ "$ARCH" = "arm64" ]; then
			BINARY_PATTERN="cipher-.*-darwin-arm64"
		else
			echo "Error: Unsupported macOS architecture $ARCH. Only Apple Silicon (arm64) is currently supported."
			exit 1
		fi
		;;
	*)
		echo "Error: Unsupported operating system $OS. Supported: Linux, macOS."
		exit 1
		;;
esac

REPO="braxiushq/cipher"
INSTALL_DIR="${HOME}/.local/bin"

TMPDIR="$(mktemp -d)"
BINARY="$TMPDIR/cipher"

cleanup() {
	rm -rf "$TMPDIR"
}
trap cleanup EXIT

echo "Installing latest release (~100 MB)..."
LATEST_URL=$(curl -sfL https://api.github.com/repos/$REPO/releases/latest | sed -n 's/.*"browser_download_url"[^"]*"\([^"]*\)".*/\1/p' | grep -E "$BINARY_PATTERN" | head -n 1)

if [ -z "$LATEST_URL" ]; then
	echo "Error: Could not find latest release for your platform."
	exit 1
fi

curl -#fL --retry 3 --retry-delay 2 -o "$BINARY" "$LATEST_URL"

FILE_TYPE=$(file -b "$BINARY" 2>/dev/null || true)
if ! echo "$FILE_TYPE" | grep -qiE "ELF|Mach-O"; then
	echo "Error: Downloaded file is not a valid binary."
	echo "       Got: $FILE_TYPE"
	echo ""
	echo "       First bytes of download (for debugging):"
	head -c 200 "$BINARY" 2>/dev/null | tr -d '\0' || true
	echo ""
	echo ""
	echo "       This may be a temporary issue. Try again later."
	exit 1
fi

chmod +x "$BINARY"
mkdir -p "$INSTALL_DIR"
mv "$BINARY" "$INSTALL_DIR/cipher"

echo ""
echo "✅ Cipher installed to $INSTALL_DIR/cipher."

if [ "$OS" = "Darwin" ]; then
	echo ""
	echo "⚠️  macOS Gatekeeper warning:"
	echo "   Run: xattr -cr $INSTALL_DIR/cipher"
else
	if ! echo "$PATH" | tr ':' '\n' | grep -qFx "$INSTALL_DIR"; then
		echo ""
		echo "⚠️  $INSTALL_DIR is not in your PATH."
		echo "   Add this to your shell config (~/.bashrc or ~/.zshrc):"
		echo ""
		echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
		echo ""
		echo "   Then restart your terminal or run: source ~/.bashrc"
	fi
fi

echo ""
echo "Run 'cipher' to get started."
