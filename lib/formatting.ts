// SPDX-License-Identifier: AGPL-3.0-only
export function formatBytes(bytes: number, decimals = 1) {
	if (!+bytes) return "0 Bytes";
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

export function formatProgressBar(pct: number): string {
	const width = 20;
	const filled = Math.round((pct / 100) * width);
	return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}
