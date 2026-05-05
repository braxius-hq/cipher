// SPDX-License-Identifier: AGPL-3.0-only
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { apiGet, apiPath, apiPost } from "./api";
import type {
	FileRecord,
	FileWithPath,
	FolderRecord,
	ListResponse,
} from "./types";

export type { FileRecord, FileWithPath, FolderRecord, ListResponse };

type ErrorIssue = {
	path: string[];
	message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isErrorIssue(value: unknown): value is ErrorIssue {
	return (
		isRecord(value) &&
		Array.isArray(value.path) &&
		value.path.every((part) => typeof part === "string") &&
		typeof value.message === "string"
	);
}

function extractError(data: unknown, fallback: string): string {
	if (!isRecord(data)) return fallback;
	if (typeof data.error === "string") return data.error;
	if (isRecord(data.error)) {
		if (Array.isArray(data.error.issues)) {
			return data.error.issues
				.filter(isErrorIssue)
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join(", ");
		}
		return JSON.stringify(data.error);
	}
	if (typeof data.message === "string") return data.message;
	return fallback;
}

export async function listItems(
	folderId: string | null = null,
	limit = 500,
	offset = 0,
) {
	let url = `${apiPath("/files/list")}?limit=${limit}&offset=${offset}`;
	if (folderId) url += `&folderId=${folderId}`;
	const { data, res } = await apiGet<ListResponse>(url);
	if (!res.ok || !data)
		throw new Error(extractError(data, "Failed to list items"));
	return data;
}

export async function createFolder(
	parentId: string | null,
	encName: string,
	ivName: string,
) {
	const { data, res } = await apiPost<{ folder: FolderRecord }>(
		apiPath("/files/create-folder"),
		{
			parentId,
			encName,
			ivName,
		},
	);
	if (!res.ok || !data)
		throw new Error(extractError(data, "Failed to create folder"));
	return data.folder;
}

export async function initUpload(storageKey: string, totalSize: number) {
	const { data, res } = await apiPost<{
		uploadUrl: string;
		storageKey: string;
	}>(apiPath("/files/init-upload"), {
		storageKey,
		totalSize,
	});
	if (!res.ok || !data)
		throw new Error(extractError(data, "Failed to initialize upload"));
	return { uploadUrl: data.uploadUrl, storageKey: data.storageKey };
}

export async function completeUpload(params: {
	storageKey: string;
	size: number;
	folderId: string | null;
	encName: string;
	ivName: string;
	encFileKey: string;
	ivFileKey: string;
}) {
	const { data, res } = await apiPost<{ file: FileRecord }>(
		apiPath("/files/complete-upload"),
		params,
	);
	if (!res.ok || !data)
		throw new Error(extractError(data, "Failed to complete upload"));
	return data.file;
}

export async function getDownloadUrl(id: string) {
	const { data, res } = await apiGet<{ url: string; file: FileRecord }>(
		`${apiPath("/files/download-url")}?id=${id}`,
	);
	if (!res.ok || !data)
		throw new Error(extractError(data, "Failed to get download URL"));
	return data;
}

export async function deleteItem(id: string, type: "file" | "folder") {
	const { res, data } = await apiPost(apiPath("/files/delete-item"), {
		id,
		type,
	});
	if (!res.ok) throw new Error(extractError(data, "Failed to delete item"));
}

export async function renameItem(
	id: string,
	type: "file" | "folder",
	encName: string,
	ivName: string,
) {
	const { res, data } = await apiPost(apiPath("/files/rename-item"), {
		id,
		type,
		encName,
		ivName,
	});
	if (!res.ok) throw new Error(extractError(data, "Failed to rename item"));
}

export async function listFolderRecursive(
	folderId: string | null,
	decryptName: (encName: string, ivName: string) => string,
): Promise<FileWithPath[]> {
	const results: FileWithPath[] = [];

	async function walk(currentFolderId: string | null, prefix: string) {
		const { folders, files } = await listItems(currentFolderId);

		for (const file of files) {
			const fileName = decryptName(file.encName, file.ivName);
			const relativePath = prefix ? `${prefix}/${fileName}` : fileName;
			results.push({ file, relativePath });
		}

		for (const folder of folders) {
			const folderName = decryptName(folder.encName, folder.ivName);
			const newPrefix = prefix ? `${prefix}/${folderName}` : folderName;
			await walk(folder.id, newPrefix);
		}
	}

	await walk(folderId, "");
	return results;
}

export async function uploadToUrl(
	url: string,
	filePath: string,
	totalSize: number,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	const file = Bun.file(filePath);
	const chunkSize = 8 * 1024 * 1024;
	let uploaded = 0;

	const body = new ReadableStream({
		async pull(controller) {
			if (signal?.aborted) {
				controller.error(new DOMException("Upload cancelled", "AbortError"));
				return;
			}
			if (uploaded >= totalSize) {
				controller.close();
				return;
			}
			const end = Math.min(uploaded + chunkSize, totalSize);
			const chunk = await file.slice(uploaded, end).arrayBuffer();
			uploaded += chunk.byteLength;
			if (onProgress) onProgress(uploaded);
			controller.enqueue(new Uint8Array(chunk));
		},
	});

	const init: RequestInit & { duplex: "half" } = {
		method: "PUT",
		body,
		duplex: "half",
		headers: {
			"Content-Length": String(totalSize),
		},
		signal,
	};
	const res = await fetch(url, init);

	if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
}

export async function uploadStreamToUrl(
	url: string,
	body: Readable,
	totalSize: number,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	let uploaded = 0;
	const progressStream = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			uploaded += chunk.length;
			if (onProgress) onProgress(uploaded);
			controller.enqueue(chunk);
		},
	});

	const init: RequestInit & { duplex: "half" } = {
		method: "PUT",
		body: Readable.toWeb(body).pipeThrough(
			progressStream,
		) as RequestInit["body"],
		duplex: "half",
		headers: {
			"Content-Length": String(totalSize),
		},
		signal,
	};
	const res = await fetch(url, init);

	if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
}

export async function downloadStreamFromUrl(url: string, signal?: AbortSignal) {
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
	if (!res.body) throw new Error("Download failed: missing response body");
	return Readable.fromWeb(res.body);
}

export async function downloadFromUrl(
	url: string,
	outputPath: string,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	let failed = true;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
	if (!res.body) throw new Error("Download failed: missing response body");

	const writeStream = createWriteStream(outputPath);
	const reader = res.body.getReader();

	let downloadedBytes = 0;

	try {
		while (true) {
			if (signal?.aborted) {
				await reader.cancel();
				throw new DOMException("Download cancelled", "AbortError");
			}
			const { done, value } = await reader.read();
			if (done) break;

			if (value) {
				writeStream.write(value);
				downloadedBytes += value.length;
				if (onProgress) onProgress(downloadedBytes);
			}
		}
		failed = false;
	} finally {
		await new Promise<void>((resolve, reject) => {
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
			writeStream.end();
		});
		if (failed) await unlink(outputPath).catch(() => {});
	}
}
