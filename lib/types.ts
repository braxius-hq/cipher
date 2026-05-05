// SPDX-License-Identifier: AGPL-3.0-only
export type Mode =
	| "browse"
	| "upload"
	| "newFolder"
	| "rename"
	| "settings"
	| "deleteConfirm"
	| "confirmQuit"
	| "confirmLogout"
	| "loading"
	| "help";

export type ItemType = "file" | "folder" | "parent";

export interface DisplayItem {
	id: string;
	type: ItemType;
	name: string;
	size?: number;
	date?: string;
}

export interface DirectoryEntry {
	fullPath: string;
	relativePath: string;
	isDirectory: boolean;
}

export interface FileRecord {
	id: string;
	folderId: string | null;
	storageKey: string;
	size: number;
	encName: string;
	ivName: string;
	encFileKey: string;
	ivFileKey: string;
	createdAt: string;
}

export interface FolderRecord {
	id: string;
	parentId: string | null;
	encName: string;
	ivName: string;
	createdAt: string;
}

export interface ListResponse {
	folders: FolderRecord[];
	files: FileRecord[];
	page: { limit: number; offset: number; nextOffset: number | null };
}

export interface FileWithPath {
	file: FileRecord;
	relativePath: string;
}

export interface AuthUser {
	publicKey: string;
	encPrivateKey: string;
	salt: string;
	iv: string;
	email?: string;
	name?: string;
	createdAt?: Date | string;
}
