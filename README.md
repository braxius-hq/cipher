# Cipher

**Terminal-based end-to-end encrypted cloud storage.**

![License](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)

Cipher is an interactive terminal client for secure cloud storage, built with [Ink](https://github.com/vadimdemedes/ink) and [Bun](https://bun.sh). All encryption happens locally on your machine — the server never sees your data or filenames.

## Quick Install

```bash
curl -sL https://raw.githubusercontent.com/braxius-hq/cipher/main/install.sh | bash
```

## Table of Contents

- [Quick Install](#quick-install)
- [Overview](#overview)
- [Security Model](#security-model-zero-knowledge-encryption)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

Cipher lets you upload, download, and manage files in the cloud with true zero-knowledge encryption. Every file and all metadata (including filenames) is encrypted before leaving your machine. The server stores only encrypted blobs — it has no knowledge of what you are storing.

Built as a fully interactive TUI (terminal user interface) — no GUI required.

## Security Model: Zero-Knowledge Encryption

Cipher implements strict end-to-end encryption. Your data is encrypted locally before it ever reaches the network.

- **Account Keys:** Argon2id key derivation generates local master keys from your password. The server never receives your password or derived keys.
- **File Encryption:** Each file is encrypted with a unique AES-256-GCM key. That file key is then encrypted with a Libsodium asymmetric public key, so only you can decrypt it.
- **Metadata:** File and folder names are AES-256-GCM encrypted. The server stores only ciphertext — zero knowledge of your file structure or contents.

## Features

- E2EE file upload and download (streaming, chunked AES-256-GCM)
- Encrypted folder creation, rename, and deletion
- Encrypted metadata (filenames are never exposed to the server)
- Interactive terminal UI with keyboard navigation
- OTP-based authentication
- Self-upgrade mechanism
- Support for large files via streaming encryption (no memory bloat)

## Installation

### Requirements

| Platform | Architecture | Status |
|----------|-------------|--------|
| Linux | x64 (amd64), ARM64 (aarch64) | Tested on Ubuntu, Debian, Fedora, Raspberry Pi 4+ |
| macOS | Apple Silicon (M1/M2/M3/M4) | Not yet tested |

### One-Line Installer

```bash
curl -sL https://raw.githubusercontent.com/braxius-hq/cipher/main/install.sh | bash
```

### From Source (Requires Bun)

```bash
git clone https://github.com/braxius-hq/cipher.git cipher
cd cipher
bun install
bun run dev
```

## Usage

Launch Cipher by running:

```bash
cipher
```

### Commands

| Command | Description |
|---------|-------------|
| `version` | Show the version number |
| `help` | Show the help message |
| `upgrade` | Update to the latest version |
| `uninstall` | Completely remove Cipher and all local data |

### Options

| Flag | Description |
|------|-------------|
| `--reset` | Reset configuration and clear local authentication |
| `--clear-auth` | Clear authentication state only |
| `--api-url <url>` | Override the default API URL |

## Development

```bash
bun install
bun run dev         # Run in development mode
bun run typecheck   # Type-check with TypeScript
bun run lint        # Lint and auto-fix with Biome
bun run format      # Format code with Biome
```

## Contributing

To ensure stability and a focused roadmap, feature contributions and large refactors are not accepted at this time. Bug reports, issues, and bug fix PRs are welcome.

## License

This project is licensed under the AGPL-3.0 License. See the [LICENSE](LICENSE) file for details.
