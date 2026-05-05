// SPDX-License-Identifier: AGPL-3.0-only
import { homedir } from "node:os";
import { join } from "node:path";
import Conf from "conf";
import { CONF_PROJECT_NAME, DEFAULT_BASE_URL } from "./constants";

const SERVICE_NAME = "cipher";

// ── Non-sensitive config (plaintext JSON, safe to store on disk) ─────────

const config = new Conf<{ baseUrl: string; downloadDir: string }>({
	projectName: CONF_PROJECT_NAME,
	defaults: {
		baseUrl: DEFAULT_BASE_URL,
		downloadDir: "",
	},
});

export function getBaseUrl(): string {
	return config.get("baseUrl");
}

export function setBaseUrl(url: string): void {
	config.set("baseUrl", url);
}

export function getDownloadDir(): string {
	const dir =
		config.get("downloadDir") || join(homedir(), "Downloads", "cipher");
	return dir.replace(/\/+$/, "");
}

export function setDownloadDir(dir: string): void {
	config.set("downloadDir", dir);
}

export function resetConfig(): void {
	config.clear();
}

// ── Sensitive secrets (OS keyring via Bun.secrets) ──────────────────────

const SECURE_KEYS = [
	"bearerToken",
	"publicKey",
	"encPrivateKey",
	"decPrivateKey",
	"salt",
	"iv",
	"masterKey",
] as const;

type SecureKey = (typeof SECURE_KEYS)[number];

async function getSecure(key: SecureKey): Promise<string> {
	try {
		const value = await Bun.secrets.get({ service: SERVICE_NAME, name: key });
		return value ?? "";
	} catch {
		return "";
	}
}

async function setSecure(key: SecureKey, value: string): Promise<void> {
	try {
		await Bun.secrets.set({ service: SERVICE_NAME, name: key, value });
	} catch {
		// Ignore secure storage errors to prevent UI rendering artifacts
	}
}

async function deleteSecure(key: SecureKey): Promise<void> {
	try {
		await Bun.secrets.delete({ service: SERVICE_NAME, name: key });
	} catch {
		// Ignore — key might not exist
	}
}

// ── Public async API ────────────────────────────────────────────────────

export async function getBearerToken(): Promise<string> {
	return getSecure("bearerToken");
}

export async function setBearerToken(token: string): Promise<void> {
	await setSecure("bearerToken", token);
}

export async function getPublicKey(): Promise<string> {
	return getSecure("publicKey");
}

export async function setPublicKey(key: string): Promise<void> {
	await setSecure("publicKey", key);
}

export async function getEncPrivateKey(): Promise<string> {
	return getSecure("encPrivateKey");
}

export async function setEncPrivateKey(key: string): Promise<void> {
	await setSecure("encPrivateKey", key);
}

export async function getDecPrivateKey(): Promise<string> {
	return getSecure("decPrivateKey");
}

export async function setDecPrivateKey(key: string): Promise<void> {
	await setSecure("decPrivateKey", key);
}

export async function getSalt(): Promise<string> {
	return getSecure("salt");
}

export async function setSalt(salt: string): Promise<void> {
	await setSecure("salt", salt);
}

export async function getIv(): Promise<string> {
	return getSecure("iv");
}

export async function setIv(iv: string): Promise<void> {
	await setSecure("iv", iv);
}

export async function getMasterKey(): Promise<string> {
	return getSecure("masterKey");
}

export async function setMasterKey(key: string): Promise<void> {
	await setSecure("masterKey", key);
}

export async function clearAuth(): Promise<void> {
	for (const key of SECURE_KEYS) {
		await deleteSecure(key);
	}
}
