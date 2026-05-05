#!/usr/bin/env bun
import { execSync } from "node:child_process";
import { rmSync, unlinkSync } from "node:fs";
// SPDX-License-Identifier: AGPL-3.0-only
import { homedir } from "node:os";
import { join } from "node:path";
import { render } from "ink";
import App from "./App";
import {
	cleanupSensitivePathsSync,
	sweepResidue,
	sweepResidueSync,
} from "./lib/cleanup";
import { clearAuth, resetConfig, setBaseUrl } from "./lib/config";
import packageJson from "./package.json";

const args = process.argv.slice(2);
const command = args[0];

if (command === "version") {
	console.log(`Cipher CLI v${packageJson.version}`);
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
	console.log("Checking for updates...");
	try {
		const res = await fetch(
			"https://api.github.com/repos/braxius-hq/cipher/releases/latest",
		);
		if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
		const release = (await res.json()) as { tag_name?: unknown };
		if (typeof release.tag_name !== "string") {
			throw new Error("GitHub API response did not include a release tag");
		}
		const latestVersion = release.tag_name.replace(/^v/, "");

		if (latestVersion === packageJson.version) {
			console.log(`Cipher is already up to date (v${packageJson.version}).`);
			process.exit(0);
		}

		console.log(
			`Upgrading from v${packageJson.version} to v${latestVersion}...`,
		);
		execSync(
			"curl -sL https://raw.githubusercontent.com/braxius-hq/cipher/main/install.sh | bash",
			{ stdio: "inherit" },
		);
	} catch (err) {
		console.error(
			"Upgrade failed:",
			err instanceof Error ? err.message : String(err),
		);
		process.exit(1);
	}
	process.exit(0);
}

if (command === "uninstall") {
	console.log("Removing Cipher...");

	await clearAuth();

	resetConfig();
	rmSync(join(homedir(), ".config", "cipher"), {
		recursive: true,
		force: true,
	});

	rmSync("/tmp/cipher-tmp", { recursive: true, force: true });

	sweepResidueSync();

	unlinkSync(process.execPath);

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

const screenHeight = process.stdout.rows ?? 24;

let app: ReturnType<typeof render>;

await sweepResidue();

process.on("uncaughtException", (err) => {
	cleanupSensitivePathsSync();
	sweepResidueSync();
	if (app) app.unmount();
	console.clear();
	console.error("Critical error:", err.message || err);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	cleanupSensitivePathsSync();
	sweepResidueSync();
	if (app) app.unmount();
	console.clear();
	console.error("Unhandled promise rejection:", reason);
	process.exit(1);
});

app = render(<App screenHeight={screenHeight} />);

process.on("SIGINT", () => {
	cleanupSensitivePathsSync();
	sweepResidueSync();
	app.unmount();
	process.exit(0);
});

await app.waitUntilExit();
