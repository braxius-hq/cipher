// SPDX-License-Identifier: AGPL-3.0-only
import { argon2id } from "hash-wasm";
import sodium from "libsodium-wrappers";
import { hexToBytes, toHex } from "./utils";

export async function generateSignupKeys(password: string) {
	if (!password) throw Error("enter password");

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hashHex = await argon2id({
		password: password,
		salt: salt,
		iterations: 3,
		memorySize: 65536,
		hashLength: 64,
		parallelism: 4,
		outputType: "hex",
	});
	const hashBytes = hexToBytes(hashHex);

	const masterKeyBytes = hashBytes.slice(0, 32);
	const loginTokenBytes = hashBytes.slice(32, 64);
	await sodium.ready;
	const keypair = sodium.crypto_box_keypair();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		masterKeyBytes,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	);

	const encryptedPrivateKey = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: iv },
			cryptoKey,
			keypair.privateKey.slice().buffer as ArrayBuffer,
		),
	);

	const rootFolderKey = crypto.getRandomValues(new Uint8Array(32));
	const encRootFolderKey = sodium.crypto_box_seal(
		rootFolderKey,
		keypair.publicKey,
	);

	return {
		loginTokenHex: toHex(loginTokenBytes),
		saltHex: toHex(salt),
		publicKeyHex: toHex(keypair.publicKey),
		encryptedPrivateKeyHex: toHex(encryptedPrivateKey),
		ivHex: toHex(iv),
		masterKeyBytes: masterKeyBytes,
		privateKey: keypair.privateKey,
		encRootFolderKeyHex: toHex(encRootFolderKey),
		ivRootFolderKeyHex: "",
		rootFolderKeyHex: toHex(rootFolderKey),
	};
}

export async function deriveLoginKeys(password: string, saltHex: string) {
	const salt = hexToBytes(saltHex);

	const hashHex = await argon2id({
		password: password,
		salt: salt,
		iterations: 3,
		memorySize: 65536,
		hashLength: 64,
		parallelism: 4,
		outputType: "hex",
	});

	const hashBytes = hexToBytes(hashHex);

	const masterKeyBytes = hashBytes.slice(0, 32);
	const loginTokenBytes = hashBytes.slice(32, 64);

	return {
		masterKeyBytes: masterKeyBytes,
		loginTokenHex: toHex(loginTokenBytes),
	};
}

export async function decryptPrivateKey(
	encryptedPrivateKeyHex: string,
	ivHex: string,
	masterKeyBytes: Uint8Array,
) {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		masterKeyBytes.slice().buffer as ArrayBuffer,
		{ name: "AES-GCM" },
		false,
		["decrypt"],
	);

	const encryptedPrivateKey = hexToBytes(encryptedPrivateKeyHex);
	const iv = hexToBytes(ivHex);

	const decryptedBuffer = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv.slice().buffer as ArrayBuffer },
		cryptoKey,
		encryptedPrivateKey.slice().buffer as ArrayBuffer,
	);

	return new Uint8Array(decryptedBuffer);
}
