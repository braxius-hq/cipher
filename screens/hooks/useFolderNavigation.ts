// SPDX-License-Identifier: AGPL-3.0-only

import { useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../lib/file-api";
import * as crypto from "../../lib/file-crypto";
import type { DisplayItem, SortDir, SortKey } from "../../lib/types";

const VISIBLE_OVERHEAD = 14;

function getTerminalRows(stdout?: { rows?: number }) {
	return stdout?.rows ?? process.stdout.rows ?? 24;
}

function sortItems(
	items: DisplayItem[],
	key: SortKey,
	dir: SortDir,
): DisplayItem[] {
	const parent = items.find((i) => i.type === "parent");
	const rest = items.filter((i) => i.type !== "parent");
	const folders = rest.filter((i) => i.type === "folder");
	const files = rest.filter((i) => i.type === "file");

	const sorted = [...folders, ...files].sort((a, b) => {
		let cmp = 0;
		if (key === "name") cmp = a.name.localeCompare(b.name);
		else if (key === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
		else if (key === "date") cmp = (a.date ?? "").localeCompare(b.date ?? "");
		return dir === "desc" ? -cmp : cmp;
	});

	return parent ? [parent, ...sorted] : sorted;
}

export function useFolderNavigation(
	rootFolderKeyHex: string,
	keysLoaded = true,
) {
	const [items, setItems] = useState<DisplayItem[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
	const [folderHistory, setFolderHistory] = useState<(string | null)[]>([]);
	const [folderNameHistory, setFolderNameHistory] = useState<string[]>([]);
	const [statusText, setStatusText] = useState("");
	const [statusVariant, setStatusVariant] = useState<"success" | "error">(
		"error",
	);
	const [isLoading, setIsLoading] = useState(false);
	const [scrollOffset, setScrollOffset] = useState(0);
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const { stdout } = useStdout();
	const [terminalRows, setTerminalRows] = useState(getTerminalRows(stdout));
	const visibleCount = Math.max(1, terminalRows - VISIBLE_OVERHEAD);

	useEffect(() => {
		const onResize = () => setTerminalRows(getTerminalRows(stdout));
		stdout?.on("resize", onResize);
		return () => {
			stdout?.off("resize", onResize);
		};
	}, [stdout]);

	const folderCache = useRef<Map<string, DisplayItem[]>>(new Map());
	const folderKeyCache = useRef<Map<string, Buffer>>(new Map());

	useEffect(() => {
		if (rootFolderKeyHex) {
			folderKeyCache.current.set(
				"__root__",
				Buffer.from(rootFolderKeyHex, "hex"),
			);
		}
	}, [rootFolderKeyHex]);

	const displayItems = useCallback(() => {
		return sortItems(items, sortKey, sortDir);
	}, [items, sortKey, sortDir]);

	const getDisplayItems = displayItems;

	const moveSelection = useCallback(
		(
			direction: "up" | "down" | "pageUp" | "pageDown" | "home" | "end",
			itemsLength: number,
		) => {
			if (itemsLength === 0) return;

			const pageSize = Math.max(1, visibleCount - 2);
			let nextIndex = selectedIndex;

			switch (direction) {
				case "up":
					nextIndex = selectedIndex > 0 ? selectedIndex - 1 : itemsLength - 1;
					break;
				case "down":
					nextIndex = selectedIndex < itemsLength - 1 ? selectedIndex + 1 : 0;
					break;
				case "pageUp":
					nextIndex = Math.max(0, selectedIndex - pageSize);
					break;
				case "pageDown":
					nextIndex = Math.min(itemsLength - 1, selectedIndex + pageSize);
					break;
				case "home":
					nextIndex = 0;
					break;
				case "end":
					nextIndex = itemsLength - 1;
					break;
			}

			let nextOffset = scrollOffset;
			if (nextIndex < scrollOffset) {
				nextOffset = nextIndex;
			} else if (nextIndex >= scrollOffset + visibleCount) {
				nextOffset = nextIndex - visibleCount + 1;
			}

			setSelectedIndex(nextIndex);
			if (nextOffset !== scrollOffset) {
				setScrollOffset(nextOffset);
			}
		},
		[selectedIndex, scrollOffset, visibleCount],
	);

	const loadFolder = useCallback(
		async (folderId: string | null) => {
			if (!rootFolderKeyHex) return;

			const cacheKey = folderId || "__root__";
			const cached = folderCache.current.get(cacheKey);
			const currentFolderKey = folderKeyCache.current.get(cacheKey);

			if (!currentFolderKey) {
				setStatusText("Missing folder key. Return to root and try again.");
				setStatusVariant("error");
				return;
			}

			if (cached) {
				setItems(cached);
				setSelectedIndex(0);
				setScrollOffset(0);
				setCurrentFolderId(folderId);
				setSelectedIds(new Set());
				setStatusText("");
				return;
			}

			try {
				setIsLoading(true);
				setStatusText("");

				const { folders, files } = await api.listItems(folderId);

				const displayItems: DisplayItem[] = [];

				if (folderId) {
					displayItems.push({
						id: `parent::${folderId}`,
						type: "parent",
						name: "..",
					});
				}

				for (const f of folders) {
					const name = crypto.decryptMetadata(
						f.encName,
						f.ivName,
						currentFolderKey,
						f.id,
					);
					try {
						const childKey = crypto.unwrapKey(
							f.encFolderKey,
							f.ivFolderKey,
							currentFolderKey,
							f.id,
						);
						folderKeyCache.current.set(f.id, childKey);
					} catch (_e) {
						// Ignored: could not unwrap child folder key, it will throw when entering
					}

					displayItems.push({
						id: f.id,
						type: "folder",
						name,
						date: new Date(f.createdAt).toLocaleDateString(),
					});
				}

				for (const f of files) {
					const name = crypto.decryptMetadata(
						f.encName,
						f.ivName,
						currentFolderKey,
						f.id,
					);
					displayItems.push({
						id: f.id,
						type: "file",
						name,
						size: f.size,
						date: new Date(f.createdAt).toLocaleDateString(),
					});
				}

				setItems(displayItems);
				setSelectedIndex(0);
				setScrollOffset(0);
				setCurrentFolderId(folderId);
				setSelectedIds(new Set());
				folderCache.current.set(cacheKey, displayItems);
			} catch (err) {
				setStatusText(
					err instanceof Error ? err.message : "Failed to load folder",
				);
				setStatusVariant("error");
			} finally {
				setIsLoading(false);
			}
		},
		[rootFolderKeyHex],
	);

	const goBack = useCallback(() => {
		if (folderHistory.length === 0) return;
		const prevFolderId = folderHistory[folderHistory.length - 1] ?? null;
		setFolderHistory((h) => h.slice(0, -1));
		setFolderNameHistory((h) => h.slice(0, -1));
		loadFolder(prevFolderId);
	}, [folderHistory, loadFolder]);

	const refreshFolder = useCallback(() => {
		folderCache.current.delete(currentFolderId ?? "__root__");
		loadFolder(currentFolderId);
	}, [currentFolderId, loadFolder]);

	const enterFolder = useCallback(
		(folderId: string, folderName: string) => {
			setFolderHistory((h) => [...h, currentFolderId ?? null]);
			setFolderNameHistory((h) => [...h, folderName]);
			loadFolder(folderId);
		},
		[currentFolderId, loadFolder],
	);

	const toggleSort = useCallback((key: SortKey) => {
		setSortKey((prev) => {
			if (prev === key) {
				setSortDir((d) => (d === "asc" ? "desc" : "asc"));
			} else {
				setSortDir("asc");
			}
			return key;
		});
	}, []);

	const toggleSelect = useCallback((itemId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(itemId)) {
				next.delete(itemId);
			} else {
				next.add(itemId);
			}
			return next;
		});
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	// Only load root folder once keys are available
	useEffect(() => {
		if (keysLoaded && rootFolderKeyHex) {
			loadFolder(null);
		}
	}, [keysLoaded, rootFolderKeyHex, loadFolder]);

	const breadcrumb = ["Cipher", ...folderNameHistory].join(" / ");

	return {
		items,
		displayItems: getDisplayItems,
		selectedIndex,
		setSelectedIndex,
		currentFolderId,
		folderNameHistory,
		folderHistory,
		statusText,
		setStatusText,
		statusVariant,
		setStatusVariant,
		isLoading,
		folderCache,
		folderKeyCache,
		loadFolder,
		goBack,
		refreshFolder,
		enterFolder,
		breadcrumb,
		scrollOffset,
		visibleCount,
		moveSelection,
		sortKey,
		sortDir,
		toggleSort,
		selectedIds,
		setSelectedIds,
		toggleSelect,
		clearSelection,
	};
}
