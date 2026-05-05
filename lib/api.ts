// SPDX-License-Identifier: AGPL-3.0-only
import { getBaseUrl, getBearerToken } from "./config";
import { API_VERSION } from "./constants";

export function apiPath(path: string): string {
	return `/api/${API_VERSION}${path}`;
}

type ApiResult<T> = {
	res: Response;
	data: T | null;
};

export async function apiRequest<T = unknown>(
	path: string,
	init: RequestInit = {},
): Promise<ApiResult<T>> {
	const baseUrl = getBaseUrl().replace(/\/$/, "");

	const headers = new Headers(init.headers);
	const token = await getBearerToken();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const res = await fetch(`${baseUrl}${path}`, {
		...init,
		headers,
	});

	let data: T | null = null;
	try {
		data = (await res.json()) as T;
	} catch {
		data = null;
	}

	return { res, data };
}

export function apiGet<T = unknown>(path: string) {
	return apiRequest<T>(path);
}

export function apiPost<T = unknown>(path: string, body: unknown) {
	return apiRequest<T>(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}
