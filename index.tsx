#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
import {
	existsSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	cleanupSensitivePathsSync,
	getTempDir,
	sweepResidue,
	sweepResidueSync,
} from "./lib/cleanup";
import { clearAuth, resetConfig, setBaseUrl } from "./lib/config";
import { runUpgrade } from "./lib/upgrade";
import { APP_VERSION } from "./lib/version";

const args = process.argv.slice(2);

function getConfigDir(): string {
	if (process.platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "cipher");
	}
	if (process.platform === "win32") {
		return join(homedir(), "AppData", "Roaming", "cipher");
	}
	return join(homedir(), ".config", "cipher");
}

function removeWindowsPowerShellShim(): void {
	const profiles = [
		join(homedir(), "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
		join(homedir(), "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
	];

	for (const profile of profiles) {
		if (!existsSync(profile)) continue;

		const content = readFileSync(profile, "utf8");
		const next = content.replace(
			/\r?\n?# Cipher CLI shim\r?\nfunction cipher \{\r?\n\s*& "[^"]+" @args\r?\n\}\r?\n?/g,
			"\n",
		);

		if (next !== content) {
			writeFileSync(profile, next.trimEnd() ? `${next.trimEnd()}\n` : "");
		}
	}
}

function removeWindowsCommandShim(): void {
	const installDir = join(homedir(), "AppData", "Local", "Programs", "cipher");
	rmSync(join(installDir, "cipher.cmd"), { force: true });
}

function removeWindowsPathEntry(): void {
	const installDir = join(homedir(), "AppData", "Local", "Programs", "cipher");
	const script = `
$install = '${installDir.replaceAll("'", "''")}';
$path = [Environment]::GetEnvironmentVariable('Path', 'User');
if ($path) {
  $parts = $path -split ';' | Where-Object { $_ -and ($_.TrimEnd('\\') -ine $install.TrimEnd('\\')) };
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User');
}
`;

	Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", script]);
}
const command = args[0];

if (command === "version") {
	console.log(`Cipher CLI v${APP_VERSION}`);
	process.exit(0);
}

if (command === "help") {
	console.log(`
Cipher — Encrypted. Private. Yours.

An end-to-end encrypted cloud storage client for the terminal.

Usage: cipher <command> [options]

Commands:
  version     Show version number
  help        Show this help
  upgrade     Update to the latest version
  uninstall   Completely remove Cipher and all local data

Options:
  --reset         Reset configuration and clear authentication
  --clear-auth    Clear authentication only
  --api-url <url> Set a custom API base URL

Run without arguments to launch the interactive terminal UI.
`);
	process.exit(0);
}

if (command === "upgrade") {
	try {
		await runUpgrade();
	} catch (err) {
		console.error(
			"Upgrade failed:",
			err instanceof Error ? err.message : String(err),
		);
		process.exit(1);
	}
}

if (command === "uninstall") {
	console.log("Removing Cipher...");

	await clearAuth();

	resetConfig();
	rmSync(getConfigDir(), {
		recursive: true,
		force: true,
	});

	rmSync(getTempDir(), { recursive: true, force: true });

	sweepResidueSync();

	if (process.platform === "win32") {
		removeWindowsPowerShellShim();
		removeWindowsCommandShim();
		removeWindowsPathEntry();

		try {
			const doomed = `${process.execPath}.old`;
			renameSync(process.execPath, doomed);
			unlinkSync(doomed);
		} catch {
			console.log("");
			console.log(`[!] Could not delete ${process.execPath}`);
			console.log(
				"   Delete it manually or restart your terminal and try again.",
			);
		}
	} else {
		unlinkSync(process.execPath);
	}

	console.log("Cipher completely removed.");
	process.exit(0);
}

if (args.includes("--reset")) {
	resetConfig();
	await clearAuth();
	console.log("Config has been reset.");
	process.exit(0);
}

if (args.includes("--clear-auth")) {
	await clearAuth();
	console.log("Auth cleared.");
	process.exit(0);
}

const apiUrlIdx = args.indexOf("--api-url");
if (apiUrlIdx !== -1) {
	const url = args[apiUrlIdx + 1];
	if (!url) {
		console.error("Error: --api-url requires a value");
		process.exit(1);
	}
	setBaseUrl(url);
	console.log(`API URL set to ${url}`);
	process.exit(0);
}

if (!process.stdin.isTTY) {
	console.error(
		"Error: This application requires an interactive terminal (TTY).",
	);
	process.exit(1);
}

const isCompiledBinary = process.execPath.includes("cipher");

if (isCompiledBinary || process.env.NODE_ENV === "production") {
	delete process.env.DEV;
}

await sweepResidue();

const { render } = await import("ink");
const { default: App } = await import("./App");

const app = render(<App />);

process.on("uncaughtException", (err) => {
	cleanupSensitivePathsSync();
	sweepResidueSync();
	app.unmount();
	console.clear();
	console.error("Critical error:", err.message || err);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	cleanupSensitivePathsSync();
	sweepResidueSync();
	app.unmount();
	console.clear();
	console.error("Unhandled promise rejection:", reason);
	process.exit(1);
});

process.on("SIGINT", () => {
	cleanupSensitivePathsSync();
	sweepResidueSync();
	app.unmount();
	process.exit(0);
});

await app.waitUntilExit();
