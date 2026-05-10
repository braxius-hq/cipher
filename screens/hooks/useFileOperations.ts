// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import type { MutableRefObject } from "react";
import { useRef, useState } from "react";
import {
	createPartialDownloadPath,
	registerSensitivePath,
	secureUnlink,
	unregisterSensitivePath,
} from "../../lib/cleanup";
import { getDownloadDir } from "../../lib/config";
import * as api from "../../lib/file-api";
import * as crypto from "../../lib/file-crypto";
import { formatBytes, formatProgressBar } from "../../lib/formatting";
import type { DirectoryEntry, DisplayItem } from "../../lib/types";

interface UseFileOperationsInput {
	currentFolderId: string | null;
	folderCache: MutableRefObject<Map<string, DisplayItem[]>>;
	folderKeyCache: MutableRefObject<Map<string, Buffer>>;
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
	currentFolderId,
	folderCache,
	folderKeyCache,
	loadFolder,
	setStatusText,
	setStatusVariant,
}: UseFileOperationsInput) {
	const [phaseText, setPhaseText] = useState("");
	const [progressText, setProgressText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [inputText, setInputText] = useState("");

	const abortRef = useRef<AbortController | null>(null);
	const activeOpsRef = useRef(0);

	const uploadSingleFile = async (
		localPath: string,
		targetFolderId: string | null,
		signal: AbortSignal,
		onEncryptProgress?: (bytes: number, total: number) => void,
		onUploadProgress?: (bytes: number, total: number) => void,
	): Promise<number> => {
		const targetFolderKey = folderKeyCache.current.get(
			targetFolderId || "__root__",
		);
		if (!targetFolderKey) throw new Error("Target folder key not found");

		const fileId = randomUUID();
		const fileKey = crypto.generateFileKey();
		const baseIv = crypto.getBaseIv();
		const { encName, ivName } = crypto.encryptMetadata(
			basename(localPath),
			targetFolderKey,
			fileId,
		);
		const { encKeyHex: encFileKeyHex, ivHex: ivFileKey } = crypto.wrapKey(
			fileKey,
			targetFolderKey,
			fileId,
		);

		const fileStats = await stat(localPath);
		const rawSize = fileStats.size;
		const totalSize = crypto.getEncryptedFileSize(rawSize);

		let uploadUrl: string;
		let storageKey: string;
		try {
			({ uploadUrl, storageKey } = await api.initUpload(
				`files/${randomUUID()}`,
				totalSize,
			));
		} catch (err) {
			throw new Error(
				`Failed to init upload for ${basename(localPath)}: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}

		try {
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
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") throw err;
			throw new Error(
				`Failed to upload ${basename(localPath)}: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}

		try {
			await api.completeUpload({
				id: fileId,
				storageKey,
				size: totalSize,
				folderId: targetFolderId,
				encName,
				ivName,
				encFileKey: encFileKeyHex,
				ivFileKey,
			});
		} catch (err) {
			throw new Error(
				`Failed to register ${basename(localPath)}: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}

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

			const folderIdMap = new Map<string, string>();
			const foldersToCreate: {
				id: string;
				parentId: string | null;
				encName: string;
				ivName: string;
				encFolderKey: string;
				ivFolderKey: string;
			}[] = [];

			setPhaseText("Creating folders...");
			setProgressText(basename(dirPath));

			const currentFolderKey = folderKeyCache.current.get(
				currentFolderId || "__root__",
			);
			if (!currentFolderKey) throw new Error("Current folder key not found");

			const rootFolderId = randomUUID();
			const rootDirKey = crypto.generateFolderKey();
			const { encName: rootEncName, ivName: rootIvName } =
				crypto.encryptMetadata(
					basename(dirPath),
					currentFolderKey,
					rootFolderId,
				);
			const { encKeyHex: encRootFolderKey, ivHex: ivRootFolderKey } =
				crypto.wrapKey(rootDirKey, currentFolderKey, rootFolderId);

			foldersToCreate.push({
				id: rootFolderId,
				parentId: currentFolderId,
				encName: rootEncName,
				ivName: rootIvName,
				encFolderKey: encRootFolderKey,
				ivFolderKey: ivRootFolderKey,
			});
			folderIdMap.set("", rootFolderId);
			folderKeyCache.current.set(rootFolderId, rootDirKey);

			for (const dir of dirs) {
				const parentPath = dir.includes("/")
					? dir.slice(0, dir.lastIndexOf("/"))
					: "";
				const parentId = folderIdMap.get(parentPath) ?? rootFolderId;
				const parentKey = folderKeyCache.current.get(parentId);
				if (!parentKey) throw new Error("Parent folder key not found");

				const dirName = dir.includes("/")
					? dir.slice(dir.lastIndexOf("/") + 1)
					: dir;

				const folderId = randomUUID();
				const dirKey = crypto.generateFolderKey();
				const { encName, ivName } = crypto.encryptMetadata(
					dirName,
					parentKey,
					folderId,
				);
				const { encKeyHex: encFolderKey, ivHex: ivFolderKey } = crypto.wrapKey(
					dirKey,
					parentKey,
					folderId,
				);

				foldersToCreate.push({
					id: folderId,
					parentId,
					encName,
					ivName,
					encFolderKey,
					ivFolderKey,
				});
				folderIdMap.set(dir, folderId);
				folderKeyCache.current.set(folderId, dirKey);
			}

			if (foldersToCreate.length > 0) {
				// Chunk if needed, but the backend accepts up to 2000 folders in one go
				for (let i = 0; i < foldersToCreate.length; i += 1000) {
					await api.bulkCreateFolders(foldersToCreate.slice(i, i + 1000));
				}
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

			setPhaseText("Preparing files...");
			setProgressText("");

			const preparedFiles = files.map((f, i) => {
				const rawSize = fileSizes[i] ?? 0;
				const totalSize = crypto.getEncryptedFileSize(rawSize);
				const parentPath = f.relativePath.includes("/")
					? f.relativePath.slice(0, f.relativePath.lastIndexOf("/"))
					: "";
				const targetFolderId = folderIdMap.get(parentPath) ?? rootFolderId;
				const targetFolderKey = folderKeyCache.current.get(
					targetFolderId || "__root__",
				);
				if (!targetFolderKey) throw new Error("Target folder key not found");

				const fileId = randomUUID();
				const fileKey = crypto.generateFileKey();
				const baseIv = crypto.getBaseIv();
				const { encName, ivName } = crypto.encryptMetadata(
					basename(f.fullPath),
					targetFolderKey,
					fileId,
				);
				const { encKeyHex: encFileKeyHex, ivHex: ivFileKey } = crypto.wrapKey(
					fileKey,
					targetFolderKey,
					fileId,
				);
				return {
					file: f,
					rawSize,
					totalSize,
					targetFolderId,
					fileId,
					fileKey,
					baseIv,
					encName,
					ivName,
					encFileKeyHex,
					ivFileKey,
					storageKey: `files/${randomUUID()}`,
					uploadUrl: "",
				};
			});

			setPhaseText("Initializing uploads...");
			let allUploads: { uploadUrl: string; storageKey: string }[] = [];
			for (let i = 0; i < preparedFiles.length; i += 1000) {
				const chunk = preparedFiles.slice(i, i + 1000);
				const chunkUploads = await api.bulkInitUpload(
					chunk.map((pf) => ({
						storageKey: pf.storageKey,
						totalSize: pf.totalSize,
					})),
				);
				allUploads = allUploads.concat(chunkUploads);
			}

			for (let i = 0; i < preparedFiles.length; i++) {
				const pf = preparedFiles[i];
				const ul = allUploads[i];
				if (pf && ul) {
					pf.uploadUrl = ul.uploadUrl;
				}
			}

			const CONCURRENCY = 50;
			const queue = [...preparedFiles];
			let completedCount = 0;
			const successfulRecords: {
				id: string;
				storageKey: string;
				size: number;
				folderId: string | null;
				encName: string;
				ivName: string;
				encFileKey: string;
				ivFileKey: string;
			}[] = [];
			const failed: { path: string; error: string }[] = [];

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

					try {
						const encryptedStream = crypto.createEncryptedFileStream(
							task.file.fullPath,
							task.fileKey,
							task.baseIv,
							undefined,
							signal,
						);

						await api.uploadStreamToUrl(
							task.uploadUrl,
							encryptedStream,
							task.totalSize,
							undefined,
							signal,
						);

						successfulRecords.push({
							id: task.fileId,
							storageKey: task.storageKey,
							size: task.totalSize,
							folderId: task.targetFolderId,
							encName: task.encName,
							ivName: task.ivName,
							encFileKey: task.encFileKeyHex,
							ivFileKey: task.ivFileKey,
						});
						completedCount++;
					} catch (err) {
						failed.push({
							path: task.file.relativePath,
							error: err instanceof Error ? err.message : "unknown error",
						});
					}
					const pct =
						totalFiles > 0
							? Math.round(
									((completedCount + failed.length) / totalFiles) * 100,
								)
							: 0;
					setPhaseText("Uploading...");
					setProgressText(
						`${formatProgressBar(pct)}  ${String(pct).padStart(3)}%  ${completedCount + failed.length}/${totalFiles} files`,
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

			if (successfulRecords.length > 0) {
				setPhaseText("Completing uploads...");
				for (let i = 0; i < successfulRecords.length; i += 1000) {
					await api.bulkCompleteUpload(successfulRecords.slice(i, i + 1000));
				}
			}

			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);

			if (failed.length === 0) {
				setStatusText(
					`Uploaded ${totalFiles} files (${formatBytes(totalRawBytes)}) from ${basename(dirPath)}`,
				);
				setStatusVariant("success");
			} else {
				const errorSummary = failed
					.slice(0, 2)
					.map((f) => `${f.path}: ${f.error}`)
					.join("; ");
				setStatusText(
					`Uploaded ${completedCount}/${totalFiles} files. Errors: ${errorSummary}${failed.length > 2 ? " ..." : ""}`,
				);
				setStatusVariant("error");
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

		activeOpsRef.current++;
		setIsLoading(true);

		try {
			const { url, file } = await api.getDownloadUrl(fileId);

			const downloadsDir = getDownloadDir();
			await mkdir(downloadsDir, { recursive: true });
			const outputPath = join(downloadsDir, plainName);

			const resolvedDownloadsDir = resolve(downloadsDir);
			const resolvedOutputPath = resolve(outputPath);
			if (
				!resolvedOutputPath.startsWith(resolvedDownloadsDir + sep) &&
				resolvedOutputPath !== resolvedDownloadsDir
			) {
				throw new Error("Invalid filename (path traversal detected)");
			}

			const uuid = randomUUID();
			partPath = createPartialDownloadPath(downloadsDir, uuid);
			registerSensitivePath(partPath);

			setPhaseText("Downloading...");
			const encSize = file.size;
			const encryptedStream = await api.downloadStreamFromUrl(url, signal);

			setPhaseText("Decrypting key...");
			setProgressText("");

			const currentFolderKey = folderKeyCache.current.get(
				currentFolderId || "__root__",
			);
			if (!currentFolderKey) throw new Error("Current folder key not found");

			const fileKey = crypto.unwrapKey(
				file.encFileKey,
				file.ivFileKey,
				currentFolderKey,
				fileId,
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

			setStatusText(`Downloaded ${plainName} → ${downloadsDir}`);
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
			activeOpsRef.current--;
			if (activeOpsRef.current <= 0) {
				activeOpsRef.current = 0;
				abortRef.current = null;
				setIsLoading(false);
				setPhaseText("");
				setProgressText("");
			}
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

		const downloadsDir = join(getDownloadDir(), folderName);

		activeOpsRef.current++;
		setIsLoading(true);

		try {
			setPhaseText("Scanning");
			setProgressText("");

			await mkdir(downloadsDir, { recursive: true });

			const currentFolderKey = folderKeyCache.current.get(
				folderId || "__root__",
			);
			if (!currentFolderKey)
				throw new Error("Folder key not found for download");

			const filesWithPaths = await api.listFolderRecursive(
				folderId,
				currentFolderKey,
				crypto.unwrapKey,
				crypto.decryptMetadata,
			);
			const totalFiles = filesWithPaths.length;

			if (totalFiles === 0) {
				setStatusText("This folder is empty");
				setStatusVariant("error");
				return;
			}

			const CONCURRENCY = 5;
			let completedCount = 0;
			const failed: { path: string; error: string }[] = [];

			async function downloadFile({
				file,
				relativePath,
				folderKey,
			}: {
				file: api.FileRecord;
				relativePath: string;
				folderKey: Buffer;
			}) {
				const outputPath = join(downloadsDir, relativePath);

				const resolvedDownloadsDir = resolve(downloadsDir);
				const resolvedOutputPath = resolve(outputPath);
				if (
					!resolvedOutputPath.startsWith(resolvedDownloadsDir + sep) &&
					resolvedOutputPath !== resolvedDownloadsDir
				) {
					throw new Error("Invalid path (path traversal detected)");
				}

				const lastSep = relativePath.lastIndexOf("/");
				const outputDir =
					lastSep > -1
						? join(downloadsDir, relativePath.slice(0, lastSep))
						: downloadsDir;

				await mkdir(outputDir, { recursive: true });

				let partPath = "";
				let downloadComplete = false;
				const uuid = randomUUID();
				partPath = createPartialDownloadPath(outputDir, uuid);
				registerSensitivePath(partPath);

				try {
					const { url, file: fileInfo } = await api.getDownloadUrl(file.id);
					const encryptedStream = await api.downloadStreamFromUrl(url, signal);
					const fileKey = crypto.unwrapKey(
						fileInfo.encFileKey,
						fileInfo.ivFileKey,
						folderKey,
						fileInfo.id,
					);

					setPhaseText("Downloading and decrypting...");
					await crypto.decryptStreamToFile(
						encryptedStream,
						partPath,
						fileKey,
						() => {
							completedCount++;
							setProgressText(
								`${completedCount}/${totalFiles} files  ${formatProgressBar(Math.round((completedCount / totalFiles) * 100))}`,
							);
							completedCount--;
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

			const queue = [...filesWithPaths];
			let completed = 0;

			async function worker() {
				while (true) {
					if (signal.aborted)
						throw new DOMException("Download cancelled", "AbortError");

					const task = queue.shift();
					if (!task) return;

					try {
						await downloadFile(task);
						completed++;
					} catch (err) {
						failed.push({
							path: task.relativePath,
							error: err instanceof Error ? err.message : "unknown error",
						});
					}
					setProgressText(
						`${completed + failed.length}/${totalFiles} files  ${formatProgressBar(Math.round(((completed + failed.length) / totalFiles) * 100))}`,
					);
				}
			}

			setPhaseText("Downloading...");
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

			if (failed.length === 0) {
				setStatusText(`Downloaded ${folderName} → ${getDownloadDir()}`);
				setStatusVariant("success");
			} else {
				const failedPaths = failed.map((f) => f.path).join(", ");
				setStatusText(
					`Downloaded ${completed}/${totalFiles} files. Failed: ${failedPaths}`,
				);
				setStatusVariant("error");
			}
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
			activeOpsRef.current--;
			if (activeOpsRef.current <= 0) {
				activeOpsRef.current = 0;
				abortRef.current = null;
				setIsLoading(false);
				setPhaseText("");
				setProgressText("");
			}
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
			const currentFolderKey = folderKeyCache.current.get(
				currentFolderId || "__root__",
			);
			if (!currentFolderKey) throw new Error("Current folder key not found");

			const newFolderId = randomUUID();
			const newFolderKey = crypto.generateFolderKey();
			const { encName, ivName } = crypto.encryptMetadata(
				folderName.trim(),
				currentFolderKey,
				newFolderId,
			);
			const { encKeyHex: encFolderKey, ivHex: ivFolderKey } = crypto.wrapKey(
				newFolderKey,
				currentFolderKey,
				newFolderId,
			);
			await api.createFolder(
				newFolderId,
				currentFolderId,
				encName,
				ivName,
				encFolderKey,
				ivFolderKey,
			);
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
			const currentFolderKey = folderKeyCache.current.get(
				currentFolderId || "__root__",
			);
			if (!currentFolderKey) throw new Error("Current folder key not found");

			const { encName, ivName } = crypto.encryptMetadata(
				newName.trim(),
				currentFolderKey,
				item.id,
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

	const handleBatchDelete = async (items: DisplayItem[]) => {
		if (items.length === 0) return;

		try {
			setIsLoading(true);
			setPhaseText("Deleting...");
			setProgressText(`0/${items.length}`);

			let deleted = 0;
			const failed: { name: string; error: string }[] = [];

			for (const item of items) {
				try {
					await api.deleteItem(item.id, item.type as "file" | "folder");
					deleted++;
				} catch (err) {
					failed.push({
						name: item.name,
						error: err instanceof Error ? err.message : "unknown error",
					});
				}
				setProgressText(`${deleted + failed.length}/${items.length}`);
			}

			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);

			if (failed.length === 0) {
				setStatusText(`Deleted ${deleted} item(s)`);
				setStatusVariant("success");
			} else {
				const failedNames = failed.map((f) => f.name).join(", ");
				setStatusText(
					`Deleted ${deleted}/${items.length}. Failed: ${failedNames}`,
				);
				setStatusVariant("error");
			}
		} catch (err) {
			folderCache.current.delete(currentFolderId ?? "__root__");
			await loadFolder(currentFolderId);
			setStatusText(
				err instanceof Error ? err.message : "Could not delete some items",
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
		handleBatchDelete,
	};
}
