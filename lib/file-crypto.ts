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
		BASE_IV_LENGTH + rawSize + Math.ceil(rawSize / CHUNK_SIZE) * AUTH_TAG_LENGTH
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

	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			if (signal?.aborted)
				return callback(new DOMException("Operation cancelled", "AbortError"));

			bytesRead += chunk.length;
			if (onProgress) onProgress(bytesRead);

			try {
				const chunkIv = Buffer.from(baseIv);
				const currentCounter = chunkIv.readUInt32LE(8);
				chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

				const cipher = createCipheriv("aes-256-gcm", fileKey, chunkIv);
				const encryptedChunk = Buffer.concat([
					cipher.update(chunk),
					cipher.final(),
					cipher.getAuthTag(),
				]);

				chunkIndex++;
				if (!wroteBaseIv) {
					wroteBaseIv = true;
					callback(null, Buffer.concat([baseIv, encryptedChunk]));
					return;
				}
				callback(null, encryptedChunk);
			} catch (err) {
				callback(err as Error);
			}
		},
		flush(callback) {
			if (!wroteBaseIv) this.push(baseIv);
			callback();
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
				if (internalBuffer.length > 0) {
					if (!baseIv) throw new Error("Base IV not found");
					if (internalBuffer.length < AUTH_TAG_LENGTH)
						throw new Error("Invalid encrypted chunk");

					const chunkIv = Buffer.from(baseIv);
					const currentCounter = chunkIv.readUInt32LE(8);
					chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

					const tag = internalBuffer.subarray(-AUTH_TAG_LENGTH);
					const ciphertext = internalBuffer.subarray(0, -AUTH_TAG_LENGTH);

					const decipher = createDecipheriv("aes-256-gcm", fileKey, chunkIv);
					decipher.setAuthTag(tag);

					this.push(
						Buffer.concat([decipher.update(ciphertext), decipher.final()]),
					);
				}
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
 * Encrypt a string (like a filename) using the user's master key.
 * Master key is symmetric (AES-GCM).
 */
export function encryptMetadata(plainText: string, masterKeyHex: string) {
	const masterKeyBytes = Buffer.from(masterKeyHex, "hex");
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", masterKeyBytes, iv);

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
 * Decrypt a string (like a filename) using the user's master key.
 */
export function decryptMetadata(
	encHex: string,
	ivHex: string,
	masterKeyHex: string,
) {
	try {
		const masterKeyBytes = Buffer.from(masterKeyHex, "hex");
		const iv = Buffer.from(ivHex, "hex");
		const encData = Buffer.from(encHex, "hex");

		const tag = encData.subarray(-16);
		const ciphertext = encData.subarray(0, -16);

		const decipher = createDecipheriv("aes-256-gcm", masterKeyBytes, iv);
		decipher.setAuthTag(tag);

		const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return dec.toString("utf8");
	} catch {
		return "[Decryption Error]";
	}
}

/**
 * Generates a random 32-byte AES-GCM key for encrypting a specific file.
 */
export function generateFileKey() {
	return randomBytes(32);
}

/**
 * Generate a random 12-byte base IV for file encryption.
 */
export function getBaseIv() {
	return randomBytes(12);
}

/**
 * Encrypt the symmetric file key using the user's public key (libsodium sealed box).
 */
export async function encryptFileKeyWithPublicKey(
	fileKey: Buffer,
	publicKeyHex: string,
) {
	await sodium.ready;
	const pubKeyBytes = Buffer.from(publicKeyHex, "hex");
	const sealed = sodium.crypto_box_seal(
		new Uint8Array(fileKey),
		new Uint8Array(pubKeyBytes),
	);
	return Buffer.from(sealed).toString("hex");
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

/**
 * Encrypt a file sequentially using AES-GCM in chunks.
 * We XOR the chunk index into the IV to ensure unique nonces per chunk.
 * Handles backpressure cleanly via Transform stream to avoid OOM on huge files.
 */
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

	let chunkIndex = 0;
	let totalBytesWritten = 0;
	let bytesRead = 0;

	// Write base IV at the start of the file
	writeStream.write(baseIv);
	totalBytesWritten += baseIv.length;

	const encryptTransform = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			if (signal?.aborted)
				return callback(new DOMException("Operation cancelled", "AbortError"));

			bytesRead += chunk.length;
			if (onProgress) onProgress(bytesRead);

			try {
				const chunkIv = Buffer.from(baseIv);
				const currentCounter = chunkIv.readUInt32LE(8);
				chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

				const cipher = createCipheriv("aes-256-gcm", fileKey, chunkIv);
				const encryptedChunk = Buffer.concat([
					cipher.update(chunk),
					cipher.final(),
					cipher.getAuthTag(),
				]);

				totalBytesWritten += encryptedChunk.length;
				chunkIndex++;

				callback(null, encryptedChunk);
			} catch (err) {
				callback(err as Error);
			}
		},
	});

	await pipeline(readStream, encryptTransform, writeStream, { signal });
	return { size: totalBytesWritten };
}

/**
 * Decrypt a chunked AES-GCM file.
 * Handles backpressure cleanly via Transform stream to avoid OOM on huge files.
 */
export async function decryptFile(
	inputPath: string,
	outputPath: string,
	fileKey: Buffer,
	onProgress?: (bytesProcessed: number) => void,
	signal?: AbortSignal,
) {
	const stats = await stat(inputPath);
	if (stats.size < 12) throw new Error("File too small to contain IV");

	const encChunkSize = CHUNK_SIZE + AUTH_TAG_LENGTH;
	const readStream = createReadStream(inputPath);
	const writeStream = createWriteStream(outputPath);

	let isFirstChunk = true;
	let baseIv: Buffer | null = null;
	let chunkIndex = 0;
	let bytesRead = 0;
	let internalBuffer = Buffer.alloc(0);

	const decryptTransform = new Transform({
		transform(data: Buffer, _encoding, callback) {
			if (signal?.aborted)
				return callback(new DOMException("Operation cancelled", "AbortError"));

			bytesRead += data.length;
			if (onProgress) onProgress(bytesRead);

			internalBuffer = Buffer.concat([internalBuffer, data]);

			if (isFirstChunk) {
				if (internalBuffer.length < 12) return callback(); // wait for full IV
				baseIv = internalBuffer.subarray(0, 12);
				internalBuffer = internalBuffer.subarray(12);
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

					const tag = chunkToProcess.subarray(-16);
					const ciphertext = chunkToProcess.subarray(0, -16);

					const decipher = createDecipheriv("aes-256-gcm", fileKey, chunkIv);
					decipher.setAuthTag(tag);

					const decryptedChunk = Buffer.concat([
						decipher.update(ciphertext),
						decipher.final(),
					]);

					this.push(decryptedChunk);
					chunkIndex++;
				}
				callback();
			} catch (err) {
				callback(err as Error);
			}
		},
		flush(callback) {
			try {
				if (internalBuffer.length > 0) {
					if (!baseIv) throw new Error("Base IV not found");

					const chunkIv = Buffer.from(baseIv);
					const currentCounter = chunkIv.readUInt32LE(8);
					chunkIv.writeUInt32LE((currentCounter ^ chunkIndex) >>> 0, 8);

					const tag = internalBuffer.subarray(-16);
					const ciphertext = internalBuffer.subarray(0, -16);

					const decipher = createDecipheriv("aes-256-gcm", fileKey, chunkIv);
					decipher.setAuthTag(tag);

					const decryptedChunk = Buffer.concat([
						decipher.update(ciphertext),
						decipher.final(),
					]);

					this.push(decryptedChunk);
				}
				callback();
			} catch (err) {
				callback(err as Error);
			}
		},
	});

	await pipeline(readStream, decryptTransform, writeStream, { signal });
}
