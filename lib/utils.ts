// SPDX-License-Identifier: AGPL-3.0-only
export function toHex(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

export function hexToBytes(hex: string): Uint8Array {
	return new Uint8Array(Buffer.from(hex, "hex"));
}
