// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { MutableRefObject } from "react";
import { useRef, useState } from "react";
import {
	createPartialDownloadPath,
	registerSensitivePath,
	secureUnlink,
	unregisterSensitivePath,
} from "../../lib/cleanup";
import * as api from "../../lib/file-api";
import * as crypto from "../../lib/file-crypto";
import { formatBytes, formatProgressBar } from "../../lib/formatting";
import type { DirectoryEntry, DisplayItem } from "../../lib/types";

interface UseFileOperationsInput {
	masterKey: string;
	publicKey: string;
	privateKey: string;
	currentFolderId: string | null;
	folderCache: MutableRefObject<Map<string, DisplayItem[]>>;
	loadFolder: (folderId: string | null) => Promise<void>;
	setStatusText: (t: string) => void;
	setStatusVariant: (v: "success" | "error") => void;
}

import ignore from "ignore";

async function walkDirectory(
	dirPath: string,
): Promise<{ dirs: string[]; files: DirectoryEntry[] }> {
	const entries: DirectoryEntry[] = [];
	const dirs: string[] = [];

	const ig = ignore().add([
		".git",
		".DS_Store",
		"Thumbs.db",
		"node_modules", // Node.js
		"__pycache__", // Python
		"*.pyc", // Python
		".venv", // Python
		"venv", // Python
		".idea", // JetBrains IDEs
		".vscode", // VS Code
	]);

	try {
		const ignoreContent = await readFile(
			join(dirPath, ".cipherignore"),
			"utf8",
		);
		ig.add(ignoreContent);
	} catch {
		// Ignore file doesn't exist, proceed with defaults
	}

	async function walk(currentPath: string, basePath: string) {
		const items = await readdir(currentPath, { withFileTypes: true });
		for (const item of items) {
			const fullPath = join(currentPath, item.name);
			const relativePath = basePath ? `${basePath}/${item.name}` : item.name;

			if (ig.ignores(relativePath)) {
				continue;
			}

			if (item.isDirectory()) {
				dirs.push(relativePath);
				await walk(fullPath, relativePath);
			} else {
				entries.push({ fullPath, relativePath, isDirectory: false });
			}
		}
	}

	await walk(dirPath, "");
	return {
		dirs,
		files: entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
	};
}

export function useFileOperations({
	masterKey,
	publicKey,
	privateKey,
	currentFolderId,
	folderCache,
	loadFolder,
	setStatusText,
	setStatusVariant,
}: UseFileOperationsInput) {
	const [phaseText, setPhaseText] = useState("");
	const [progressText, setProgressText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [inputText, setInputText] = useState("");

	const abortRef = useRef<AbortController | null>(null);

	const uploadSingleFile = async (
		localPath: string,
		targetFolderId: string | null,
		signal: AbortSignal,
		onEncryptProgress?: (bytes: number, total: number) => void,
		onUploadProgress?: (bytes: number, total: number) => void,
	): Promise<number> => {
		const fileKey = crypto.generateFileKey();
		const baseIv = crypto.getBaseIv();
		const { encName, ivName } = crypto.encryptMetadata(
			basename(localPath),
			masterKey,
		);
		const encFileKeyHex = await crypto.encryptFileKeyWithPublicKey(
			fileKey,
			publicKey,
		);

		const fileStats = await stat(localPath);
		const rawSize = fileStats.size;
		const totalSize = crypto.getEncryptedFileSize(rawSize);

		const { uploadUrl, storageKey } = await api.initUpload(
			`files/${randomUUID()}`,
			totalSize,
		);

		const encryptedStream = crypto.createEncryptedFileStream(
			localPath,
			fileKey,
			baseIv,
			(bytes) => onEncryptProgress?.(bytes, rawSize),
			signal,
		);

		await api.uploadStreamToUrl(
			uploadUrl,
			encryptedStream,
			totalSize,
			(bytes) => onUploadProgress?.(bytes, totalSize),
			signal,
		);

		await api.completeUpload({
			storageKey,
			size: totalSize,
			folderId: targetFolderId,
			encName,
			ivName,
			encFileKey: encFileKeyHex,
			ivFileKey: baseIv.toString("hex"),
		});

		return totalSize;
	};

	const handleFolderUpload = async (dirPath: string) => {
		const controller = new AbortController();
		abortRef.current = controller;
		const signal = controller.signal;

		try {
			setIsLoading(true);
			setPhaseText("Scanning");
			setProgressText("");

			const { dirs, files } = await walkDirectory(dirPath);
			const totalFiles = files.length;

			const folderIdMap = new Map<string, string | null>();
			setPhaseText("Creating folders...");
			setProgressText(basename(dirPath));

			const { encName, ivName } = crypto.encryptMetadata(
				basename(dirPath),
				masterKey,
			);
			const rootFolder = await api.createFolder(
				currentFolderId,
				encName,
				ivName,
			);
			folderIdMap.set("", rootFolder.id);

			for (const dir of dirs) {
				const parentPath = dir.includes("/")
					? dir.slice(0, dir.lastIndexOf("/"))
					: "";
				const parentId = folderIdMap.get(parentPath) ?? rootFolder.id;
				const dirName = dir.includes("/")
					? dir.slice(dir.lastIndexOf("/") + 1)
					: dir;

				setPhaseText("Creating folders...");
				setProgressText(dir);

				const { encName, ivName } = crypto.encryptMetadata(dirName, masterKey);
				const folder = await api.createFolder(parentId, encName, ivName);
				folderIdMap.set(dir, folder.id);
			}

			if (totalFiles === 0) {
				folderCache.current.delete(currentFolderId ?? "__root__");
				await loadFolder(currentFolderId);
				setStatusText(`Created empty folder ${basename(dirPath)}`);
				setStatusVariant("success");
				return;
			}

			const fileSizes = await Promise.all(
				files.map((f) => stat(f.fullPath).then((s) => s.size)),
			);
			const totalRawBytes = fileSizes.reduce((a, b) => a + b, 0);

			const CONCURRENCY = 10;
			const queue = files.map((f, i) => ({ file: f, index: i }));
			let completedCount = 0;

			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
				process.stdin.resume();
			}

			async function worker() {
				while (true) {
					if (signal.aborted)
						throw new DOMException("Upload cancelled", "AbortError");

					const task = queue.shift();
					if (!task) return;

					const { file } = task;
					const parentPath = file.relativePath.includes("/")
						? file.relativePath.slice(0, file.relativePath.lastIndexOf("/"))
						: "";
					const targetFolderId = folderIdMap.get(parentPath) ?? rootFolder.id;

					await uploadSingleFile(file.fullPath, targetFolderId, signal);

					completedCount++;
					const pct =
						totalFiles > 0
							? Math.round((completedCount / totalFiles) * 100)
							: 0;
					setPhaseText("Uploading...");
					setProgressText(
						`${formatProgressBar(pct)}  ${String(pct).padStart(3)}%  ${completedCount}/${totalFiles} files`,
					);
				}
			}

			setPhaseText("Uploading...");
			setProgressText(`0/${totalFiles} files`);

			try {
				await Promise.all(
					Array.from({ length: Math.min(CONCURRENCY, totalFiles) }, () =>
						worker(),
					),
				);
			} catch (err) {
				controller.abort();
				throw err;
			}

			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);
			setStatusText(
				`Uploaded ${totalFiles} files (${formatBytes(totalRawBytes)}) from ${basename(dirPath)}`,
			);
			setStatusVariant("success");
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				setStatusText("Upload cancelled");
			} else {
				setStatusText(
					err instanceof Error
						? err.message
						: "Upload failed — check your connection",
				);
			}
			setStatusVariant("error");
		} finally {
			abortRef.current = null;
			setIsLoading(false);
			setPhaseText("");
			setProgressText("");
		}
	};

	const handleUpload = async (localPath: string) => {
		if (!localPath.trim()) return;

		const controller = new AbortController();
		abortRef.current = controller;
		const signal = controller.signal;

		try {
			setIsLoading(true);
			setPhaseText("Preparing...");
			setProgressText(localPath);

			const pathStat = await stat(localPath);

			if (pathStat.isDirectory()) {
				await handleFolderUpload(localPath);
			} else {
				setPhaseText("Encrypting...");
				setProgressText("");
				await uploadSingleFile(
					localPath,
					currentFolderId,
					signal,
					(bytes, rawSize) => {
						const pct = rawSize > 0 ? Math.round((bytes / rawSize) * 100) : 0;
						setProgressText(
							`${formatProgressBar(pct)}  ${String(pct).padStart(3)}%  ${formatBytes(bytes, 1).padStart(9)} / ${formatBytes(rawSize, 1).padStart(9)}`,
						);
					},
					(bytes, totalSize) => {
						setPhaseText("Uploading...");
						const pct =
							totalSize > 0 ? Math.round((bytes / totalSize) * 100) : 0;
						setProgressText(
							`${formatProgressBar(pct)}  ${String(pct).padStart(3)}%  ${formatBytes(bytes, 1).padStart(9)} / ${formatBytes(totalSize, 1).padStart(9)}`,
						);
					},
				);
				if (process.stdin.isTTY) {
					process.stdin.setRawMode(true);
					process.stdin.resume();
				}
				folderCache.current.delete(currentFolderId ?? "__root__");
				await loadFolder(currentFolderId);
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				setStatusText("Upload cancelled");
			} else {
				setStatusText(
					err instanceof Error
						? err.message
						: "Upload failed — check your connection",
				);
			}
			setStatusVariant("error");
		} finally {
			abortRef.current = null;
			setIsLoading(false);
			setPhaseText("");
			setProgressText("");
		}
	};

	const handleDownload = async (fileId: string, plainName: string) => {
		const controller = new AbortController();
		abortRef.current = controller;
		const signal = controller.signal;
		let partPath = "";
		let downloadComplete = false;

		try {
			setIsLoading(true);

			const { url, file } = await api.getDownloadUrl(fileId);

			const downloadsDir = join(homedir(), "Downloads", "cipher");
			await mkdir(downloadsDir, { recursive: true });
			const outputPath = join(downloadsDir, plainName);

			const uuid = randomUUID();
			partPath = createPartialDownloadPath(downloadsDir, uuid);
			registerSensitivePath(partPath);

			setPhaseText("Downloading...");
			const encSize = file.size;
			const encryptedStream = await api.downloadStreamFromUrl(url, signal);

			setPhaseText("Decrypting key...");
			setProgressText("");
			const fileKey = await crypto.decryptFileKeyWithPrivateKey(
				file.encFileKey,
				publicKey,
				privateKey,
			);

			setPhaseText("Downloading and decrypting...");
			await crypto.decryptStreamToFile(
				encryptedStream,
				partPath,
				fileKey,
				(bytes) => {
					const pct = encSize > 0 ? Math.round((bytes / encSize) * 100) : 0;
					setProgressText(
						`${formatProgressBar(pct)}  ${String(pct).padStart(3)}%  ${formatBytes(bytes, 1).padStart(9)} / ${formatBytes(encSize, 1).padStart(9)}`,
					);
				},
				signal,
			);

			await rename(partPath, outputPath);
			downloadComplete = true;
			unregisterSensitivePath(partPath);
			partPath = "";

			setStatusText(`Downloaded to ~/Downloads/cipher/${plainName}`);
			setStatusVariant("success");
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				setStatusText("Download cancelled");
			} else {
				setStatusText(
					err instanceof Error ? err.message : "Download failed — try again",
				);
			}
			setStatusVariant("error");
		} finally {
			abortRef.current = null;
			setIsLoading(false);
			setPhaseText("");
			setProgressText("");
			if (partPath) {
				unregisterSensitivePath(partPath);
				if (!downloadComplete) await secureUnlink(partPath);
			}
		}
	};

	const handleFolderDownload = async (folderId: string, folderName: string) => {
		const controller = new AbortController();
		abortRef.current = controller;
		const signal = controller.signal;

		const downloadsDir = join(homedir(), "Downloads", "cipher", folderName);

		try {
			setIsLoading(true);
			setPhaseText("Scanning");
			setProgressText("");

			await mkdir(downloadsDir, { recursive: true });

			const filesWithPaths = await api.listFolderRecursive(
				folderId,
				(encName, ivName) => crypto.decryptMetadata(encName, ivName, masterKey),
			);
			const totalFiles = filesWithPaths.length;

			if (totalFiles === 0) {
				setStatusText("This folder is empty");
				setStatusVariant("error");
				return;
			}

			for (const [i, { file, relativePath }] of filesWithPaths.entries()) {
				setPhaseText("Downloading...");
				setProgressText(`File ${i + 1}/${totalFiles}: ${relativePath}`);

				let partPath = "";
				let downloadComplete = false;
				const outputPath = join(downloadsDir, relativePath);

				try {
					const { url, file: fileInfo } = await api.getDownloadUrl(file.id);

					const encSize = fileInfo.size;
					const encryptedStream = await api.downloadStreamFromUrl(url, signal);

					const fileKey = await crypto.decryptFileKeyWithPrivateKey(
						fileInfo.encFileKey,
						publicKey,
						privateKey,
					);

					const lastSep = relativePath.lastIndexOf("/");
					if (lastSep > -1) {
						const outputDir = join(
							downloadsDir,
							relativePath.slice(0, lastSep),
						);
						await mkdir(outputDir, { recursive: true });
					}
					const outputDir =
						lastSep > -1
							? join(downloadsDir, relativePath.slice(0, lastSep))
							: downloadsDir;
					partPath = createPartialDownloadPath(outputDir, randomUUID());
					registerSensitivePath(partPath);

					setPhaseText("Downloading and decrypting...");
					await crypto.decryptStreamToFile(
						encryptedStream,
						partPath,
						fileKey,
						(bytes) => {
							const pct = encSize > 0 ? Math.round((bytes / encSize) * 100) : 0;
							setProgressText(
								`File ${i + 1}/${totalFiles}: ${relativePath} ${formatProgressBar(pct)} ${String(pct).padStart(3)}%`,
							);
						},
						signal,
					);
					await rename(partPath, outputPath);
					downloadComplete = true;
					unregisterSensitivePath(partPath);
					partPath = "";
				} finally {
					if (partPath) {
						unregisterSensitivePath(partPath);
						if (!downloadComplete) await secureUnlink(partPath);
					}
				}
			}

			setStatusText(`Downloaded to ~/Downloads/cipher/${folderName}`);
			setStatusVariant("success");
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				setStatusText("Download cancelled");
			} else {
				setStatusText(
					err instanceof Error ? err.message : "Download failed — try again",
				);
			}
			setStatusVariant("error");
		} finally {
			abortRef.current = null;
			setIsLoading(false);
			setPhaseText("");
			setProgressText("");
		}
	};

	const handleCreateFolder = async (folderName: string) => {
		if (isLoading) return;
		if (!folderName.trim()) return;

		const abortController = new AbortController();
		abortRef.current = abortController;
		setIsLoading(true);
		setPhaseText("Creating folder...");
		setProgressText("");
		setStatusText("");

		try {
			const { encName, ivName } = crypto.encryptMetadata(
				folderName.trim(),
				masterKey,
			);
			await api.createFolder(currentFolderId, encName, ivName);
			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);
			setStatusText(`Created folder '${folderName.trim()}'`);
			setStatusVariant("success");
		} catch (err) {
			setStatusText(
				err instanceof Error
					? err.message
					: "Could not create folder — try again",
			);
			setStatusVariant("error");
		} finally {
			setIsLoading(false);
			abortRef.current = null;
			setPhaseText("");
			setProgressText("");
		}
	};

	const handleRename = async (item: DisplayItem, newName: string) => {
		if (isLoading) return;
		if (!newName.trim()) return;

		const abortController = new AbortController();
		abortRef.current = abortController;
		setIsLoading(true);
		setPhaseText("Renaming...");
		setProgressText("");
		setStatusText("");

		try {
			const { encName, ivName } = crypto.encryptMetadata(
				newName.trim(),
				masterKey,
			);
			await api.renameItem(
				item.id,
				item.type as "file" | "folder",
				encName,
				ivName,
			);
			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);
			setStatusText(`Renamed to '${newName.trim()}'`);
			setStatusVariant("success");
		} catch (err) {
			setStatusText(
				err instanceof Error ? err.message : "Could not rename — try again",
			);
			setStatusVariant("error");
		} finally {
			setIsLoading(false);
			abortRef.current = null;
			setPhaseText("");
			setProgressText("");
		}
	};

	const handleDelete = async (item: DisplayItem) => {
		try {
			setIsLoading(true);
			setPhaseText("Deleting...");
			setProgressText("");

			await api.deleteItem(item.id, item.type as "file" | "folder");

			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);
		} catch (err) {
			setStatusText(
				err instanceof Error ? err.message : "Could not delete — try again",
			);
			setStatusVariant("error");
		} finally {
			setIsLoading(false);
			setPhaseText("");
			setProgressText("");
		}
	};

	return {
		phaseText,
		progressText,
		isLoading,
		inputText,
		setInputText,
		abortRef,
		handleUpload,
		handleDownload,
		handleFolderDownload,
		handleCreateFolder,
		handleRename,
		handleDelete,
	};
}
