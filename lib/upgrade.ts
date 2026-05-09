// SPDX-License-Identifier: AGPL-3.0-only
import {
	chmodSync,
	closeSync,
	createWriteStream,
	mkdirSync,
	openSync,
	readSync,
	renameSync,
	unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	clearQuarantine,
	getBinaryName,
	getEmoji,
	getInstallDir,
	getUpgradeTarget,
	isOnPath,
	isWindows,
	shouldChmod,
	validateBinaryMagic,
} from "./platform";
import { APP_VERSION } from "./version";

const GITHUB_API =
	"https://api.github.com/repos/braxiushq/cipher/releases/latest";

interface GitHubAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

interface GitHubRelease {
	tag_name: string;
	assets: GitHubAsset[];
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

function findAsset(release: GitHubRelease, target: string): GitHubAsset {
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

	const stream = createWriteStream(dest);
	try {
		let received = 0;
		let lastPct = -1;

		const reader = res.body.getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			stream.write(value);
			received += value.length;

			if (expectedSize > 0) {
				const pct = Math.floor((received / expectedSize) * 100);
				if (pct !== lastPct) {
					process.stdout.write(`\r  Downloading... ${pct}%`);
					lastPct = pct;
				}
			}
		}
	} finally {
		stream.end();
	}

	if (expectedSize > 0) {
		process.stdout.write("\r  Downloading... 100%\n");
	}
}

function validateBinary(path: string): void {
	const fd = openSync(path, "r");
	const buf = Buffer.alloc(4);
	readSync(fd, buf, 0, 4, 0);
	closeSync(fd);

	const type = validateBinaryMagic(buf);
	if (type === null) {
		throw new Error(
			"Downloaded file is not a valid binary. This may be a temporary issue. Try again later.",
		);
	}
}

function installBinary(tempPath: string): string {
	if (shouldChmod()) {
		chmodSync(tempPath, 0o755);
	}

	const installDir = getInstallDir();
	const binaryName = getBinaryName();
	const target = join(installDir, binaryName);

	mkdirSync(dirname(target), { recursive: true });

	const isStandardLocation = process.execPath === target;
	if (isStandardLocation && isWindows()) {
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

	const target = getUpgradeTarget();
	const asset = findAsset(release, target);
	const installDir = getInstallDir();

	console.log(`  Downloading cipher v${latestVersion} for ${target}...`);

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
			if (isWindows()) {
				const doomed = `${process.execPath}.old`;
				renameSync(process.execPath, doomed);
				unlinkSync(doomed);
			} else {
				unlinkSync(process.execPath);
			}
		} catch {}
	}

	clearQuarantine(installedPath);

	const onPath = isOnPath();

	console.log("");
	console.log(
		`${getEmoji("✅")} Cipher upgraded to v${latestVersion} at ${installedPath}.`,
	);
	if (!onPath) {
		console.log("");
		console.log(`${getEmoji("⚠️")}  ${installDir} is not in your PATH.`);
		if (isWindows()) {
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
