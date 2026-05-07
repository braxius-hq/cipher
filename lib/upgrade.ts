// SPDX-License-Identifier: AGPL-3.0-only
import {
	chmodSync,
	closeSync,
	mkdirSync,
	openSync,
	readSync,
	renameSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { APP_VERSION } from "./version";

const GITHUB_API =
	"https://api.github.com/repos/braxius-hq/cipher/releases/latest";

type PlatformTarget =
	| "linux-amd64"
	| "linux-arm64"
	| "darwin-arm64"
	| "windows-amd64";

function getInstallDir(): string {
	if (process.platform === "win32") {
		return join(homedir(), "AppData", "Local", "Programs", "cipher");
	}
	return join(homedir(), ".local", "bin");
}

function getBinaryName(): string {
	return process.platform === "win32" ? "cipher.exe" : "cipher";
}

interface GitHubAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

interface GitHubRelease {
	tag_name: string;
	assets: GitHubAsset[];
}

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const MACHO_MAGICS = [
	Buffer.from([0xfe, 0xed, 0xfa, 0xce]),
	Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
	Buffer.from([0xce, 0xfa, 0xed, 0xfe]),
	Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
];
const PE_MAGIC = Buffer.from([0x4d, 0x5a]);

function getPlatformTarget(): PlatformTarget {
	const { platform, arch } = process;
	if (platform === "linux" && arch === "x64") return "linux-amd64";
	if (platform === "linux" && arch === "arm64") return "linux-arm64";
	if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
	if (platform === "win32" && arch === "x64") return "windows-amd64";
	throw new Error(
		`Unsupported platform: ${platform}-${arch}. Supported: linux-x64, linux-arm64, darwin-arm64, windows-x64.`,
	);
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
	const res = await fetch(GITHUB_API);
	if (!res.ok) {
		throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
	}
	const data = (await res.json()) as GitHubRelease;
	if (typeof data.tag_name !== "string") {
		throw new Error("GitHub API response did not include a release tag.");
	}
	if (!Array.isArray(data.assets)) {
		throw new Error("GitHub API response did not include release assets.");
	}
	return data;
}

export async function checkForUpdate(): Promise<string | null> {
	try {
		const release = await fetchLatestReleaseWithTimeout(3000);
		if (!release) return null;
		const latest = release.tag_name.replace(/^v/, "");
		if (latest === APP_VERSION) return null;
		return latest;
	} catch {
		return null;
	}
}

async function fetchLatestReleaseWithTimeout(
	ms: number,
): Promise<GitHubRelease | null> {
	try {
		const res = await fetch(GITHUB_API, { signal: AbortSignal.timeout(ms) });
		if (!res.ok) return null;
		const data = (await res.json()) as GitHubRelease;
		if (typeof data.tag_name !== "string") return null;
		return data;
	} catch {
		return null;
	}
}

function findAsset(
	release: GitHubRelease,
	target: PlatformTarget,
): GitHubAsset {
	const pattern = target.startsWith("windows-")
		? new RegExp(`cipher-.*-${target}\\.exe$`)
		: new RegExp(`cipher-.*-${target}$`);
	const asset = release.assets.find((a) => pattern.test(a.name));
	if (!asset) {
		const supported = release.assets.map((a) => a.name).join(", ");
		throw new Error(
			`No binary available for ${target}. Available: ${supported || "none"}`,
		);
	}
	return asset;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadBinary(
	url: string,
	dest: string,
	expectedSize: number,
): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Download failed: ${res.status} ${res.statusText}`);
	}
	if (!res.body) {
		throw new Error("Download failed: no response body.");
	}

	const fd = openSync(dest, "w");
	let received = 0;
	let lastPercent = -1;

	try {
		const reader = res.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			writeSync(fd, value);
			received += value.length;
			if (expectedSize > 0) {
				const pct = Math.floor((received / expectedSize) * 100);
				if (pct !== lastPercent) {
					process.stdout.write(`\r  Downloading... ${pct}%`);
					lastPercent = pct;
				}
			}
		}
	} finally {
		closeSync(fd);
	}

	process.stdout.write("\r  Downloading... 100%\n");
}

function validateBinary(path: string): void {
	const fd = openSync(path, "r");
	const buf = Buffer.alloc(4);
	try {
		readSync(fd, buf, 0, 4, 0);
	} finally {
		closeSync(fd);
	}

	if (process.platform === "linux") {
		if (buf.equals(ELF_MAGIC)) return;
		throw new Error(
			"Downloaded file is not a valid binary. This may be a temporary issue. Try again later.",
		);
	}
	if (process.platform === "darwin") {
		if (MACHO_MAGICS.some((m) => buf.equals(m))) return;
		throw new Error(
			"Downloaded file is not a valid binary. This may be a temporary issue. Try again later.",
		);
	}
	if (process.platform === "win32") {
		if (buf.equals(PE_MAGIC)) return;
		throw new Error(
			"Downloaded file is not a valid binary. This may be a temporary issue. Try again later.",
		);
	}
	throw new Error(`Cannot validate binary on ${process.platform}.`);
}

function installBinary(tempPath: string): string {
	if (process.platform !== "win32") {
		chmodSync(tempPath, 0o755);
	}

	const installDir = getInstallDir();
	const binaryName = getBinaryName();
	const target = join(installDir, binaryName);

	mkdirSync(dirname(target), { recursive: true });

	const isStandardLocation = process.execPath === target;
	if (isStandardLocation && process.platform === "win32") {
		const doomed = `${target}.old`;
		renameSync(target, doomed);
		renameSync(tempPath, target);
		try {
			unlinkSync(doomed);
		} catch {}
	} else if (isStandardLocation) {
		renameSync(tempPath, target);
	} else {
		try {
			renameSync(tempPath, target);
		} catch {
			unlinkSync(tempPath);
			throw new Error(
				`Cannot write to ${target}. Try running: sudo mv ${tempPath} ${target}`,
			);
		}
	}

	return target;
}

function clearQuarantine(binaryPath: string): void {
	if (process.platform !== "darwin") return;
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

export async function runUpgrade(): Promise<void> {
	if (APP_VERSION === "0.0.0-dev") {
		console.error("Cannot upgrade a development build.");
		process.exit(1);
	}

	console.log("Checking for updates...");

	const release = await fetchLatestRelease();
	const latestVersion = release.tag_name.replace(/^v/, "");

	if (latestVersion === APP_VERSION) {
		console.log(`Cipher is already up to date (v${APP_VERSION}).`);
		process.exit(0);
	}

	console.log(`Upgrading from v${APP_VERSION} to v${latestVersion}...`);

	const target = getPlatformTarget();
	const asset = findAsset(release, target);
	const installDir = getInstallDir();

	console.log(
		`  Downloading cipher v${latestVersion} for ${target} (${formatBytes(asset.size)})...`,
	);

	const tempPath = join(installDir, `cipher-${latestVersion}.new`);

	mkdirSync(installDir, { recursive: true });

	try {
		await downloadBinary(asset.browser_download_url, tempPath, asset.size);
	} catch (err) {
		try {
			unlinkSync(tempPath);
		} catch {}
		throw err;
	}

	console.log("  Verifying binary...");
	validateBinary(tempPath);

	let installedPath: string;
	try {
		installedPath = installBinary(tempPath);
	} catch (err) {
		try {
			unlinkSync(tempPath);
		} catch {}
		throw err;
	}

	if (
		process.execPath !== installedPath &&
		process.execPath.includes("cipher")
	) {
		try {
			if (process.platform === "win32") {
				const doomed = `${process.execPath}.old`;
				renameSync(process.execPath, doomed);
				unlinkSync(doomed);
			} else {
				unlinkSync(process.execPath);
			}
		} catch {}
	}

	clearQuarantine(installedPath);

	const pathSep = process.platform === "win32" ? ";" : ":";
	const isOnPath = process.env.PATH?.split(pathSep).includes(installDir);

	const emoji = process.platform === "win32" ? "[OK]" : "✅";
	const warn = process.platform === "win32" ? "[!]" : "⚠️";

	console.log("");
	console.log(
		`${emoji} Cipher upgraded to v${latestVersion} at ${installedPath}.`,
	);
	if (!isOnPath) {
		console.log("");
		console.log(`${warn}  ${installDir} is not in your PATH.`);
		if (process.platform === "win32") {
			console.log(
				"   Add it via: Settings > System > About > Advanced system settings > Environment Variables",
			);
		} else {
			console.log("   Add this to your shell config (~/.bashrc or ~/.zshrc):");
			console.log("");
			console.log('   export PATH="$HOME/.local/bin:$PATH"');
			console.log("");
			console.log("   Then restart your terminal or run: source ~/.bashrc");
		}
	}

	process.exit(0);
}
