// SPDX-License-Identifier: AGPL-3.0-only
import { homedir } from "node:os";
import { join } from "node:path";

export type Platform = "linux" | "darwin" | "win32";

export function getPlatform(): Platform {
	return process.platform as Platform;
}

export function isWindows(): boolean {
	return process.platform === "win32";
}

export function isMacOS(): boolean {
	return process.platform === "darwin";
}

export function isLinux(): boolean {
	return process.platform === "linux";
}

export function getConfigDir(): string {
	if (process.platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "cipher");
	}
	if (process.platform === "win32") {
		return join(homedir(), "AppData", "Roaming", "cipher");
	}
	return join(homedir(), ".config", "cipher");
}

export function getInstallDir(): string {
	if (process.platform === "win32") {
		return join(homedir(), "AppData", "Local", "Programs", "cipher");
	}
	return join(homedir(), ".local", "bin");
}

export function getBinaryName(): string {
	return process.platform === "win32" ? "cipher-cli.exe" : "cipher";
}

export function getPathSep(): string {
	return process.platform === "win32" ? ";" : ":";
}

export function isOnPath(): boolean {
	const pathSep = getPathSep();
	const installDir = getInstallDir();
	return process.env.PATH?.split(pathSep).includes(installDir) ?? false;
}

export function getEmoji(ok: "✅" | "⚠️"): string {
	if (isWindows()) {
		if (ok === "✅") return "[OK]";
		if (ok === "⚠️") return "[!]";
	}
	return ok;
}

export function shouldChmod(): boolean {
	return process.platform !== "win32";
}

export type UpgradeTarget =
	| "linux-amd64"
	| "linux-arm64"
	| "darwin-arm64"
	| "windows-amd64";

export function getUpgradeTarget(): UpgradeTarget {
	const { platform, arch } = process;
	if (platform === "linux" && arch === "x64") return "linux-amd64";
	if (platform === "linux" && arch === "arm64") return "linux-arm64";
	if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
	if (platform === "win32" && arch === "x64") return "windows-amd64";
	throw new Error(
		`Unsupported platform: ${platform}-${arch}. Supported: linux-x64, linux-arm64, darwin-arm64, windows-x64.`,
	);
}

export type BinaryType = "elf" | "macho" | "pe";

export function validateBinaryMagic(magic: Uint8Array): BinaryType | null {
	if (
		magic[0] === 0x7f &&
		magic[1] === 0x45 &&
		magic[2] === 0x4c &&
		magic[3] === 0x46
	) {
		return "elf";
	}
	if (
		(magic[0] === 0xfe &&
			magic[1] === 0xed &&
			magic[2] === 0xfa &&
			magic[3] === 0xce) ||
		(magic[0] === 0xfe &&
			magic[1] === 0xed &&
			magic[2] === 0xfa &&
			magic[3] === 0xcf) ||
		(magic[0] === 0xce &&
			magic[1] === 0xfa &&
			magic[2] === 0xed &&
			magic[3] === 0xfe) ||
		(magic[0] === 0xcf &&
			magic[1] === 0xfa &&
			magic[2] === 0xed &&
			magic[3] === 0xfe)
	) {
		return "macho";
	}
	if (magic[0] === 0x4d && magic[1] === 0x5a) {
		return "pe";
	}
	return null;
}

export function clearQuarantine(binaryPath: string): void {
	if (!isMacOS()) return;
	try {
		const proc = Bun.spawnSync(["xattr", "-cr", binaryPath]);
		if (proc.exitCode !== 0) {
			console.log(
				`  Run this command to clear macOS Gatekeeper: xattr -cr ${binaryPath}`,
			);
		}
	} catch {
		console.log(
			`  Run this command to clear macOS Gatekeeper: xattr -cr ${binaryPath}`,
		);
	}
}
