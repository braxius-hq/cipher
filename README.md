# Cipher

An end-to-end encrypted (E2EE) cloud storage client.

Cipher is a fully-featured, interactive terminal file manager built with [Ink](https://github.com/vadimdemedes/ink) and [Bun](https://bun.sh). It provides a secure way to manage your files entirely from the command line.

![License](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)
![Version](https://img.shields.io/github/v/release/braxius-hq/cipher)

## Security Model: Zero-Knowledge Encryption
Cipher implements strict end-to-end encryption. Your data is encrypted locally on your machine before it is ever sent to the network.
- **Account Keys:** Uses Argon2id key derivation to generate local Master Keys.
- **File Encryption:** Each file is encrypted with a unique AES-256-GCM key, which is itself encrypted using a Libsodium asymmetric public key system. 
- **Metadata:** File and folder names are also AES-256-GCM encrypted. The server has zero knowledge of what you are storing.

## Installation

### Requirements

- **Linux** — x64 (amd64) and ARM64 (aarch64)
- Tested on Ubuntu, Debian, Fedora, Raspberry Pi 4+

### One-Line Installer
```bash
curl -sL https://raw.githubusercontent.com/braxius-hq/cipher/main/install.sh | bash
```

### Install from source (Requires Bun)
```bash
git clone https://github.com/braxius-hq/cipher.git cipher
cd cipher
bun install
bun run dev
```

## Usage

Run the app by simply typing:
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

## Contributing
We welcome contributions! Please make sure your code passes formatting and type checks:
```bash
bun run typecheck
bun run format
```

## License
This project is licensed under the AGPL-3.0 License. See the [LICENSE](LICENSE) file for details.
