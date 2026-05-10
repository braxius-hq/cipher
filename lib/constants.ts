// SPDX-License-Identifier: AGPL-3.0-only
export const APP_NAME = "cipher";
export const CONF_PROJECT_NAME = "cipher";

const IS_PROD = process.env.NODE_ENV === "production";

export const DEFAULT_BASE_URL = 
	process.env.CIPHER_API_URL || 
	(IS_PROD ? "https://api.cipher.braxius.com" : "http://localhost:3000");

export const API_VERSION = "v1";
