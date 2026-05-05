// SPDX-License-Identifier: AGPL-3.0-only
import {
	closeSync,
	existsSync,
	fsyncSync,
	openSync,
	readdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { mkdir, open, readdir, rm, stat, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ZERO_CHUNK_SIZE = 64 * 1024;
const PARTIAL_DOWNLOAD_PREFIX = ".cipher-";
const PARTIAL_DOWNLOAD_SUFFIX = ".part";

const sensitivePaths = new Set<string>();

export function getTempDir() {
	return join(tmpdir(), "cipher-tmp");
}

export function createPartialDownloadPath(directory: string, id: string) {
	return join(
		directory,
		`${PARTIAL_DOWNLOAD_PREFIX}${id}${PARTIAL_DOWNLOAD_SUFFIX}`,
	);
}

export function registerSensitivePath(path: string) {
	sensitivePaths.add(path);
}

export function unregisterSensitivePath(path: string) {
	sensitivePaths.delete(path);
}

export async function secureUnlink(path: string) {
	try {
		const fileStat = await stat(path);
		if (fileStat.isFile() && fileStat.size > 0) {
			const file = await open(path, "r+");
			try {
				const zeroChunk = Buffer.alloc(ZERO_CHUNK_SIZE);
				let offset = 0;
				while (offset < fileStat.size) {
					const length = Math.min(zeroChunk.length, fileStat.size - offset);
					await file.write(zeroChunk, 0, length, offset);
					offset += length;
				}
				await file.sync();
			} finally {
				await file.close().catch(() => {});
			}
		}
	} catch {
		// Best-effort overwrite only; still remove the directory entry below.
	} finally {
		await unlink(path).catch(() => {});
	}
}

export function secureUnlinkSync(path: string) {
	let fd: number | null = null;
	try {
		const fileStat = statSync(path);
		if (fileStat.isFile() && fileStat.size > 0) {
			fd = openSync(path, "r+");
			const zeroChunk = Buffer.alloc(ZERO_CHUNK_SIZE);
			let offset = 0;
			while (offset < fileStat.size) {
				const length = Math.min(zeroChunk.length, fileStat.size - offset);
				writeSync(fd, zeroChunk, 0, length, offset);
				offset += length;
			}
			fsyncSync(fd);
		}
	} catch {
		// Best-effort overwrite only; still remove the directory entry below.
	} finally {
		if (fd !== null) {
			try {
				closeSync(fd);
			} catch {}
		}
		try {
			unlinkSync(path);
		} catch {}
	}
}

export async function cleanupSensitivePaths() {
	const paths = Array.from(sensitivePaths);
	sensitivePaths.clear();
	await Promise.all(paths.map((path) => secureUnlink(path)));
}

export function cleanupSensitivePathsSync() {
	const paths = Array.from(sensitivePaths);
	sensitivePaths.clear();
	for (const path of paths) secureUnlinkSync(path);
}

async function sweepDirectoryFiles(directory: string) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		await Promise.all(
			entries.map((entry) => {
				const fullPath = join(directory, entry.name);
				if (entry.isDirectory())
					return rm(fullPath, { recursive: true, force: true });
				return unlink(fullPath).catch(() => {});
			}),
		);
	} catch {}
}

function sweepDirectoryFilesSync(directory: string) {
	try {
		if (!existsSync(directory)) return;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const fullPath = join(directory, entry.name);
			try {
				if (entry.isDirectory())
					rmSync(fullPath, { recursive: true, force: true });
				else unlinkSync(fullPath);
			} catch {}
		}
	} catch {}
}

async function sweepPartialDownloads(directory: string) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		await Promise.all(
			entries.map(async (entry) => {
				const fullPath = join(directory, entry.name);
				if (entry.isDirectory()) {
					await sweepPartialDownloads(fullPath);
					return;
				}
				if (
					entry.name.startsWith(PARTIAL_DOWNLOAD_PREFIX) &&
					entry.name.endsWith(PARTIAL_DOWNLOAD_SUFFIX)
				) {
					await secureUnlink(fullPath);
				}
			}),
		);
	} catch {}
}

function sweepPartialDownloadsSync(directory: string) {
	try {
		if (!existsSync(directory)) return;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const fullPath = join(directory, entry.name);
			if (entry.isDirectory()) {
				sweepPartialDownloadsSync(fullPath);
				continue;
			}
			if (
				entry.name.startsWith(PARTIAL_DOWNLOAD_PREFIX) &&
				entry.name.endsWith(PARTIAL_DOWNLOAD_SUFFIX)
			) {
				secureUnlinkSync(fullPath);
			}
		}
	} catch {}
}

import { getDownloadDir } from "./config";

export async function sweepResidue() {
	await mkdir(getTempDir(), { recursive: true, mode: 0o700 });
	await sweepDirectoryFiles(getTempDir());
	const configuredDir = getDownloadDir();
	await sweepPartialDownloads(configuredDir);
	// Also sweep legacy default if different from configured
	const legacyDir = join(homedir(), "Downloads", "cipher");
	if (legacyDir !== configuredDir) {
		await sweepPartialDownloads(legacyDir);
	}
}

export function sweepResidueSync() {
	sweepDirectoryFilesSync(getTempDir());
	const configuredDir = getDownloadDir();
	sweepPartialDownloadsSync(configuredDir);
	const legacyDir = join(homedir(), "Downloads", "cipher");
	if (legacyDir !== configuredDir) {
		sweepPartialDownloadsSync(legacyDir);
	}
}
