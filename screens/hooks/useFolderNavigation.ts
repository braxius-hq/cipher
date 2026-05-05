// SPDX-License-Identifier: AGPL-3.0-only

import { useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../lib/file-api";
import * as crypto from "../../lib/file-crypto";
import type { DisplayItem } from "../../lib/types";

const VISIBLE_OVERHEAD = 14;

function getTerminalRows(stdout?: { rows?: number }) {
	return stdout?.rows ?? process.stdout.rows ?? 24;
}

export function useFolderNavigation(masterKey: string, keysLoaded = true) {
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

	const moveSelection = useCallback(
		(direction: "up" | "down", itemsLength: number) => {
			if (itemsLength === 0) return;

			const nextIndex =
				direction === "up"
					? selectedIndex > 0
						? selectedIndex - 1
						: itemsLength - 1
					: selectedIndex < itemsLength - 1
						? selectedIndex + 1
						: 0;

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

	const folderCache = useRef<Map<string, DisplayItem[]>>(new Map());

	const loadFolder = useCallback(
		async (folderId: string | null) => {
			if (!masterKey) return;

			const cacheKey = folderId || "__root__";
			const cached = folderCache.current.get(cacheKey);

			if (cached) {
				setItems(cached);
				setSelectedIndex(0);
				setScrollOffset(0);
				setCurrentFolderId(folderId);
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
					const name = crypto.decryptMetadata(f.encName, f.ivName, masterKey);
					displayItems.push({
						id: f.id,
						type: "folder",
						name,
						date: new Date(f.createdAt).toLocaleDateString(),
					});
				}

				for (const f of files) {
					const name = crypto.decryptMetadata(f.encName, f.ivName, masterKey);
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
		[masterKey],
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

	// Only load root folder once keys are available
	useEffect(() => {
		if (keysLoaded && masterKey) {
			loadFolder(null);
		}
	}, [keysLoaded, masterKey, loadFolder]);

	const breadcrumb = ["Cipher", ...folderNameHistory].join(" / ");

	return {
		items,
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
		loadFolder,
		goBack,
		refreshFolder,
		enterFolder,
		breadcrumb,
		scrollOffset,
		visibleCount,
		moveSelection,
	};
}
