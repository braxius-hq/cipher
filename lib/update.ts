// SPDX-License-Identifier: AGPL-3.0-only
import packageJson from "../package.json";

export async function checkForUpdate(): Promise<string | null> {
	try {
		const res = await fetch(
			"https://api.github.com/repos/braxius-hq/cipher/releases/latest",
			{ signal: AbortSignal.timeout(3000) },
		);
		if (!res.ok) return null;
		const release = (await res.json()) as { tag_name?: string };
		if (typeof release.tag_name !== "string") return null;
		const latest = release.tag_name.replace(/^v/, "");
		if (latest === packageJson.version) return null;
		return latest;
	} catch {
		return null;
	}
}
