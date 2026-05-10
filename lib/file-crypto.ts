// SPDX-License-Identifier: AGPL-3.0-only
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import sodium from "libsodium-wrappers";

// Constants for chunking
const CHUNK_SIZE = 64 * 1024; // 64KB chunks (same as standard Web Crypto chunk sizes)
const AUTH_TAG_LENGTH = 16;
const BASE_IV_LENGTH = 12;

export function getEncryptedFileSize(rawSize: number) {
	return (
		BASE_IV_LENGTH +
		rawSize +
		Math.floor(rawSize / CHUNK_SIZE) * AUTH_TAG_LENGTH +
		AUTH_TAG_LENGTH
	);
}

function createEncryptTransform(
	fileKey: Buffer,
	baseIv: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	let chunkIndex = 0;
	let bytesRead = 0;
	let wroteBaseIv = false;
	let internalBuffer = Buffer.alloc(0);

	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			if (signal?.aborted)
				return callback(new DOMException("Operation cancelled", "AbortError"));

			bytesRead += chunk.length;
			if (onProgress) onProgress(bytesRead);

			internalBuffer = Buffer.concat([internalBuffer, chunk]);

			try {
				while (internalBuffer.length >= CHUNK_SIZE) {
					const chunkToProcess = internalBuffer.subarray(0, CHUNK_SIZE);
					internalBuffer = internalBuffer.subarray(CHUNK_SIZE);

					const chunkIv = Buffer.from(baseIv);
					const currentCounter = chunkIv.readUInt32LE(8);
					chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

					const cipher = createCipheriv("aes-256-gcm", fileKey, chunkIv);
					cipher.setAAD(Buffer.from([0])); // intermediate
					const encryptedChunk = Buffer.concat([
						cipher.update(chunkToProcess),
						cipher.final(),
						cipher.getAuthTag(),
					]);

					chunkIndex++;
					if (!wroteBaseIv) {
						wroteBaseIv = true;
						this.push(Buffer.concat([baseIv, encryptedChunk]));
					} else {
						this.push(encryptedChunk);
					}
				}
				callback();
			} catch (err) {
				callback(err as Error);
			}
		},
		flush(callback) {
			try {
				const chunkIv = Buffer.from(baseIv);
				const currentCounter = chunkIv.readUInt32LE(8);
				chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

				const cipher = createCipheriv("aes-256-gcm", fileKey, chunkIv);
				cipher.setAAD(Buffer.from([1])); // final
				const encryptedChunk = Buffer.concat([
					cipher.update(internalBuffer),
					cipher.final(),
					cipher.getAuthTag(),
				]);

				if (!wroteBaseIv) {
					this.push(Buffer.concat([baseIv, encryptedChunk]));
				} else {
					this.push(encryptedChunk);
				}
				callback();
			} catch (err) {
				callback(err as Error);
			}
		},
	});
}

function createDecryptTransform(
	fileKey: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	const encChunkSize = CHUNK_SIZE + AUTH_TAG_LENGTH;
	let isFirstChunk = true;
	let baseIv: Buffer | null = null;
	let chunkIndex = 0;
	let bytesRead = 0;
	let internalBuffer = Buffer.alloc(0);

	return new Transform({
		transform(data: Buffer, _encoding, callback) {
			if (signal?.aborted)
				return callback(new DOMException("Operation cancelled", "AbortError"));

			bytesRead += data.length;
			if (onProgress) onProgress(bytesRead);

			internalBuffer = Buffer.concat([internalBuffer, data]);

			if (isFirstChunk) {
				if (internalBuffer.length < BASE_IV_LENGTH) return callback();
				baseIv = internalBuffer.subarray(0, BASE_IV_LENGTH);
				internalBuffer = internalBuffer.subarray(BASE_IV_LENGTH);
				isFirstChunk = false;
			}

			try {
				while (internalBuffer.length >= encChunkSize) {
					const chunkToProcess = internalBuffer.subarray(0, encChunkSize);
					internalBuffer = internalBuffer.subarray(encChunkSize);

					if (!baseIv) throw new Error("Base IV not found");

					const chunkIv = Buffer.from(baseIv);
					const currentCounter = chunkIv.readUInt32LE(8);
					chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

					const tag = chunkToProcess.subarray(-AUTH_TAG_LENGTH);
					const ciphertext = chunkToProcess.subarray(0, -AUTH_TAG_LENGTH);

					const decipher = createDecipheriv("aes-256-gcm", fileKey, chunkIv);
					decipher.setAAD(Buffer.from([0])); // intermediate
					decipher.setAuthTag(tag);

					this.push(
						Buffer.concat([decipher.update(ciphertext), decipher.final()]),
					);
					chunkIndex++;
				}
				callback();
			} catch (err) {
				callback(err as Error);
			}
		},
		flush(callback) {
			try {
				if (!baseIv) throw new Error("Base IV not found");
				if (internalBuffer.length < AUTH_TAG_LENGTH)
					throw new Error("File truncated or invalid");

				const chunkIv = Buffer.from(baseIv);
				const currentCounter = chunkIv.readUInt32LE(8);
				chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

				const tag = internalBuffer.subarray(-AUTH_TAG_LENGTH);
				const ciphertext = internalBuffer.subarray(0, -AUTH_TAG_LENGTH);

				const decipher = createDecipheriv("aes-256-gcm", fileKey, chunkIv);
				decipher.setAAD(Buffer.from([1])); // final chunk
				decipher.setAuthTag(tag);

				this.push(
					Buffer.concat([decipher.update(ciphertext), decipher.final()]),
				);
				callback();
			} catch (err) {
				callback(err as Error);
			}
		},
	});
}

export function createEncryptedFileStream(
	inputPath: string,
	fileKey: Buffer,
	baseIv: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	return createReadStream(inputPath, { highWaterMark: CHUNK_SIZE }).pipe(
		createEncryptTransform(fileKey, baseIv, onProgress, signal),
	);
}

export async function decryptStreamToFile(
	inputStream: Readable,
	outputPath: string,
	fileKey: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	const writeStream = createWriteStream(outputPath);
	await pipeline(
		inputStream,
		createDecryptTransform(fileKey, onProgress, signal),
		writeStream,
		{
			signal,
		},
	);
}

/**
 * Wrap a symmetric key (like a FileKey or a child FolderKey) with a parent key.
 */
export function wrapKey(keyToWrap: Buffer, wrappingKey: Buffer, aad?: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
	if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

	const enc = Buffer.concat([
		cipher.update(keyToWrap),
		cipher.final(),
		cipher.getAuthTag(),
	]);

	return {
		encKeyHex: enc.toString("hex"),
		ivHex: iv.toString("hex"),
	};
}

/**
 * Unwrap a symmetric key with its parent key.
 */
export function unwrapKey(
	encKeyHex: string,
	ivHex: string,
	wrappingKey: Buffer,
	aad?: string,
) {
	const iv = Buffer.from(ivHex, "hex");
	const encData = Buffer.from(encKeyHex, "hex");

	const tag = encData.subarray(-16);
	const ciphertext = encData.subarray(0, -16);

	const decipher = createDecipheriv("aes-256-gcm", wrappingKey, iv);
	if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
	decipher.setAuthTag(tag);

	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a string (like a filename) using the folder key.
 */
export function encryptMetadata(
	plainText: string,
	folderKeyBytes: Buffer,
	aad?: string,
) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", folderKeyBytes, iv);
	if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

	const enc = Buffer.concat([
		cipher.update(Buffer.from(plainText, "utf8")),
		cipher.final(),
		cipher.getAuthTag(),
	]);

	return {
		encName: enc.toString("hex"),
		ivName: iv.toString("hex"),
	};
}

/**
 * Decrypt a string (like a filename) using the folder key.
 */
export function decryptMetadata(
	encHex: string,
	ivHex: string,
	folderKeyBytes: Buffer,
	aad?: string,
) {
	try {
		const iv = Buffer.from(ivHex, "hex");
		const encData = Buffer.from(encHex, "hex");

		const tag = encData.subarray(-16);
		const ciphertext = encData.subarray(0, -16);

		const decipher = createDecipheriv("aes-256-gcm", folderKeyBytes, iv);
		if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
		decipher.setAuthTag(tag);

		const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return dec.toString("utf8");
	} catch {
		return "[Decryption Error]";
	}
}

/**
 * Generates a random 32-byte AES-GCM key for encrypting a specific file or folder.
 */
export function generateFileKey() {
	return randomBytes(32);
}
export const generateFolderKey = generateFileKey;

/**
 * Generate a random 12-byte base IV for file encryption.
 */
export function getBaseIv() {
	return randomBytes(12);
}

/**
 * Decrypt the symmetric file key using the user's private key (libsodium sealed box).
 */
export async function decryptFileKeyWithPrivateKey(
	encFileKeyHex: string,
	publicKeyHex: string,
	privateKeyHex: string,
) {
	await sodium.ready;
	const encFileKey = new Uint8Array(Buffer.from(encFileKeyHex, "hex"));
	const pubKeyBytes = new Uint8Array(Buffer.from(publicKeyHex, "hex"));
	const privKeyBytes = new Uint8Array(Buffer.from(privateKeyHex, "hex"));

	const decrypted = sodium.crypto_box_seal_open(
		encFileKey,
		pubKeyBytes,
		privKeyBytes,
	);
	if (!decrypted) throw new Error("Failed to decrypt file key");
	return Buffer.from(decrypted);
}

export async function encryptFile(
	inputPath: string,
	outputPath: string,
	fileKey: Buffer,
	baseIv: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	const readStream = createReadStream(inputPath, { highWaterMark: CHUNK_SIZE });
	const writeStream = createWriteStream(outputPath);

	let totalBytesWritten = 0;
	const sizeTracker = new Transform({
		transform(chunk, _enc, cb) {
			totalBytesWritten += chunk.length;
			cb(null, chunk);
		},
	});

	await pipeline(
		readStream,
		createEncryptTransform(fileKey, baseIv, onProgress, signal),
		sizeTracker,
		writeStream,
		{ signal },
	);

	return { size: totalBytesWritten };
}

export async function decryptFile(
	inputPath: string,
	outputPath: string,
	fileKey: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	const stats = await stat(inputPath);
	if (stats.size < BASE_IV_LENGTH + AUTH_TAG_LENGTH)
		throw new Error("File too small");

	const readStream = createReadStream(inputPath, {
		highWaterMark: CHUNK_SIZE + AUTH_TAG_LENGTH,
	});
	const writeStream = createWriteStream(outputPath);

	await pipeline(
		readStream,
		createDecryptTransform(fileKey, onProgress, signal),
		writeStream,
		{ signal },
	);
}
