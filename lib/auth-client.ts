// SPDX-License-Identifier: AGPL-3.0-only
import { createAuthClient } from "better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import {
	clearAuth,
	getBaseUrl,
	getBearerToken,
	setBearerToken,
} from "./config";

export const authClient = createAuthClient({
	baseURL: getBaseUrl(),
	plugins: [
		inferAdditionalFields({
			user: {
				publicKey: { type: "string", required: true },
				encPrivateKey: { type: "string", required: true },
				salt: { type: "string", required: true },
				iv: { type: "string", required: true },
			},
		}),
	],
	fetchOptions: {
		auth: {
			type: "Bearer",
			token: () => getBearerToken(),
		},
		onSuccess: async (ctx) => {
			const authToken = ctx.response.headers.get("set-auth-token");
			if (authToken) {
				await setBearerToken(authToken);
			}
		},
		onError: async (ctx) => {
			if (ctx.response.status === 401) {
				await clearAuth();
			}
		},
	},
});
