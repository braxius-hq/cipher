// SPDX-License-Identifier: AGPL-3.0-only

import { homedir } from "node:os";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import Dialog from "../components/Dialog";
import ConfirmDialog from "../components/dialogs/ConfirmDialog";
import HelpDialog from "../components/dialogs/HelpDialog";
import InputDialog from "../components/dialogs/InputDialog";
import SettingsDialog from "../components/dialogs/SettingsDialog";
import UpdateDialog from "../components/dialogs/UpdateDialog";
import UploadDialog from "../components/dialogs/UploadDialog";
import FileList from "../components/FileList";
import PathInput from "../components/PathInput";
import { Spinner, StatusMessage } from "../components/ui";
import { authClient } from "../lib/auth-client";
import { COLORS } from "../lib/colors";
import {
	clearAuth,
	getDecPrivateKey,
	getDownloadDir,
	getMasterKey,
	getPublicKey,
	setDownloadDir as saveDownloadDir,
} from "../lib/config";
import type { Mode } from "../lib/types";
import { useFileOperations } from "./hooks/useFileOperations";
import { useFolderNavigation } from "./hooks/useFolderNavigation";

interface Props {
	onLogout: () => void;
	latestVersion?: string | null;
}

export default function FileManagerScreen({ onLogout, latestVersion }: Props) {
	const [mode, setMode] = useState<Mode>("loading");
	const [displayEmail, setDisplayEmail] = useState("");
	const [downloadDirInput, setDownloadDirInput] = useState("");
	const [updateDismissed, setUpdateDismissed] = useState(false);

	// Keys loaded asynchronously from Bun.secrets
	const [masterKey, setMasterKeyState] = useState("");
	const [publicKey, setPublicKeyState] = useState("");
	const [privateKey, setPrivateKeyState] = useState("");
	const [keysLoaded, setKeysLoaded] = useState(false);

	useEffect(() => {
		Promise.all([getMasterKey(), getPublicKey(), getDecPrivateKey()]).then(
			([mk, pk, sk]) => {
				setMasterKeyState(mk);
				setPublicKeyState(pk);
				setPrivateKeyState(sk);
				setKeysLoaded(true);
				setMode("browse");
			},
		);
	}, []);

	useEffect(() => {
		authClient.getSession().then((res) => {
			const user = res?.data?.user;
			if (user?.email) {
				setDisplayEmail(user.email);
			}
		});
	}, []);

	useEffect(() => {
		if (keysLoaded && latestVersion && !updateDismissed && mode === "browse") {
			setMode("update");
		}
	}, [keysLoaded, latestVersion, updateDismissed, mode]);

	const nav = useFolderNavigation(masterKey, keysLoaded);

	const ops = useFileOperations({
		masterKey,
		publicKey,
		privateKey,
		currentFolderId: nav.currentFolderId,
		folderCache: nav.folderCache,
		loadFolder: nav.loadFolder,
		setStatusText: nav.setStatusText,
		setStatusVariant: nav.setStatusVariant,
	});

	const displayItems = nav.displayItems();
	const selectedItem = displayItems[nav.selectedIndex];

	const handleAction = async () => {
		if (mode === "upload") {
			setMode("browse");
			await ops.handleUpload(ops.inputText);
			ops.setInputText("");
			return;
		}

		if (mode === "newFolder") {
			setMode("browse");
			await ops.handleCreateFolder(ops.inputText);
			ops.setInputText("");
			return;
		}

		if (mode === "rename") {
			setMode("browse");
			if (selectedItem && selectedItem.type !== "parent") {
				await ops.handleRename(selectedItem, ops.inputText);
			}
			ops.setInputText("");
			return;
		}

		if (mode === "deleteConfirm") {
			if (nav.selectedIds.size > 0) {
				setMode("browse");
				await ops.handleBatchDelete(
					displayItems.filter(
						(i) => nav.selectedIds.has(i.id) && i.type !== "parent",
					),
				);
				nav.clearSelection();
			} else if (selectedItem && selectedItem.type !== "parent") {
				setMode("browse");
				await ops.handleDelete(selectedItem);
			} else {
				setMode("browse");
			}
			return;
		}

		if (mode === "browse") {
			if (!selectedItem) return;

			if (selectedItem.type === "parent") {
				nav.goBack();
			} else if (selectedItem.type === "folder") {
				nav.enterFolder(selectedItem.id, selectedItem.name);
			} else if (selectedItem.type === "file") {
				await ops.handleDownload(selectedItem.id, selectedItem.name);
			}
		}
	};

	const isBusy = nav.isLoading || ops.isLoading;
	const isInteractiveDialog =
		mode === "deleteConfirm" ||
		mode === "confirmQuit" ||
		mode === "confirmLogout" ||
		mode === "upload" ||
		mode === "newFolder" ||
		mode === "rename" ||
		mode === "settings" ||
		mode === "help" ||
		mode === "downloadDir" ||
		mode === "update";

	useInput((input, key) => {
		if (!keysLoaded) return;

		if (isBusy) {
			if (input.toLowerCase() === "c") {
				ops.abortRef.current?.abort();
			}
			return;
		}

		if (key.escape || (key.ctrl && input === "c")) {
			if (mode !== "browse") {
				if (mode === "update") {
					setUpdateDismissed(true);
				}
				setMode("browse");
				nav.setStatusText("");
				nav.clearSelection();
				return;
			}
			setMode("confirmQuit");
		}

		if (mode === "help") {
			if (key.escape || input === "?") {
				setMode("browse");
			}
			return;
		}

		if (mode === "settings") {
			return;
		}

		if (mode === "downloadDir") {
			if (key.escape) {
				setMode("browse");
			}
			return;
		}

		if (mode === "browse") {
			if (key.upArrow || input === "k") {
				nav.moveSelection("up", displayItems.length);
			}
			if (key.downArrow || input === "j") {
				nav.moveSelection("down", displayItems.length);
			}
			if (key.pageUp || (key.ctrl && input === "u")) {
				nav.moveSelection("pageUp", displayItems.length);
			}
			if (key.pageDown || (key.ctrl && input === "d")) {
				nav.moveSelection("pageDown", displayItems.length);
			}
			if (key.home || input === "g") {
				nav.moveSelection("home", displayItems.length);
			}
			if (key.end || (input === "G" && !key.shift)) {
				nav.moveSelection("end", displayItems.length);
			}
			if (key.return || input === "l") {
				handleAction();
			}
			if (key.backspace || key.delete || input === "h") {
				nav.goBack();
			}

			if (input === " ") {
				if (selectedItem && selectedItem.type !== "parent") {
					nav.toggleSelect(selectedItem.id);
				}
			}
			if (input.toLowerCase() === "a") {
				const toggled = new Set(nav.selectedIds);
				for (const item of displayItems) {
					if (item.type !== "parent") {
						toggled.add(item.id);
					}
				}
				if (toggled.size === nav.selectedIds.size && nav.selectedIds.size > 0) {
					nav.clearSelection();
				} else {
					nav.setSelectedIds(toggled);
				}
			}
			if (input === "?") setMode("help");
			if (input.toLowerCase() === "s" && !key.ctrl) setMode("settings");
			if (input.toLowerCase() === "u") {
				ops.setInputText(`${homedir()}/`);
				setMode("upload");
			}
			if (input.toLowerCase() === "n") {
				ops.setInputText("");
				setMode("newFolder");
			}
			if (input.toLowerCase() === "d") {
				if (nav.selectedIds.size > 0) {
					setMode("deleteConfirm");
				} else if (selectedItem && selectedItem.type !== "parent") {
					setMode("deleteConfirm");
				}
			}
			if (key.ctrl && input.toLowerCase() === "r") {
				nav.refreshFolder();
			}
			if (input.toLowerCase() === "r" && !key.ctrl) {
				if (selectedItem && selectedItem.type !== "parent") {
					ops.setInputText(selectedItem.name);
					setMode("rename");
				}
			}
			if (input.toLowerCase() === "z") {
				if (nav.selectedIds.size > 0) {
					const selectedItems = displayItems.filter(
						(i) => nav.selectedIds.has(i.id) && i.type !== "parent",
					);
					for (const item of selectedItems) {
						if (item.type === "folder") {
							ops.handleFolderDownload(item.id, item.name);
						} else {
							ops.handleDownload(item.id, item.name);
						}
					}
				} else if (selectedItem?.type === "folder") {
					ops.handleFolderDownload(selectedItem.id, selectedItem.name);
				} else if (selectedItem?.type === "file") {
					ops.handleDownload(selectedItem.id, selectedItem.name);
				}
			}
			// Sort by column
			if (input === "1") nav.toggleSort("name");
			if (input === "2") nav.toggleSort("size");
			if (input === "3") nav.toggleSort("date");
		}
	});

	// Loading state while keys are being fetched from keyring
	if (!keysLoaded) {
		return (
			<Box
				flexDirection="column"
				width="100%"
				flexGrow={1}
				justifyContent="center"
				alignItems="center"
			>
				<Spinner label="Unlocking vault..." />
			</Box>
		);
	}

	const selectedForDelete =
		selectedItem && selectedItem.type !== "parent" ? selectedItem : null;

	const deleteTitle =
		nav.selectedIds.size > 0
			? `Delete ${nav.selectedIds.size} item(s)?`
			: selectedForDelete?.type === "folder"
				? `Delete '${selectedForDelete.name}' and all contents?`
				: selectedForDelete
					? `Delete '${selectedForDelete.name}'?`
					: "";

	return (
		<Box flexDirection="column" width="100%" flexGrow={1} paddingX={1}>
			{/* Header */}
			<Box
				flexDirection="row"
				justifyContent="space-between"
				borderBottom
				paddingX={1}
				borderStyle="single"
				borderColor={COLORS.BORDER}
			>
				<Text bold color={COLORS.ACCENT}>
					{nav.breadcrumb}
				</Text>
				<Text dimColor>Encrypted. Private. Yours.</Text>
			</Box>
			{/* Main Content */}
			<Box flexDirection="column" flexGrow={1} paddingY={1}>
				{!isInteractiveDialog && (
					<FileList
						items={displayItems}
						selectedIndex={nav.selectedIndex}
						dimmed={isBusy}
						scrollOffset={nav.scrollOffset}
						visibleCount={nav.visibleCount}
						selectedIds={nav.selectedIds}
						sortKey={nav.sortKey}
						sortDir={nav.sortDir}
					/>
				)}

				{isInteractiveDialog && (
					<Box
						position="absolute"
						top={0}
						left={0}
						right={0}
						bottom={0}
						justifyContent="center"
						alignItems="center"
					>
						{mode === "deleteConfirm" && deleteTitle && (
							<ConfirmDialog
								title={deleteTitle}
								borderColor={COLORS.ERROR}
								titleColor={COLORS.ERROR}
								onConfirm={handleAction}
								onCancel={() => {
									nav.clearSelection();
									setMode("browse");
								}}
							/>
						)}
						{mode === "confirmQuit" && (
							<ConfirmDialog
								title="Exit cipher?"
								borderColor={COLORS.WARNING}
								titleColor={COLORS.WARNING}
								onConfirm={() => process.exit(0)}
								onCancel={() => setMode("browse")}
							/>
						)}
						{mode === "confirmLogout" && (
							<ConfirmDialog
								title="Sign out?"
								borderColor={COLORS.WARNING}
								titleColor={COLORS.WARNING}
								onConfirm={async () => {
									await authClient.signOut();
									await clearAuth();
									onLogout();
								}}
								onCancel={() => setMode("browse")}
							/>
						)}
						{mode === "settings" && (
							<SettingsDialog
								displayEmail={displayEmail}
								onLogout={() => setMode("confirmLogout")}
								onDownloadDir={() => {
									setDownloadDirInput(getDownloadDir());
									setMode("downloadDir");
								}}
							/>
						)}
						{mode === "upload" && (
							<UploadDialog
								inputText={ops.inputText}
								onChange={ops.setInputText}
								onSubmit={handleAction}
							/>
						)}
						{mode === "newFolder" && (
							<InputDialog
								title="New folder"
								label="Name: "
								hint="[Enter] Create    [Esc] Cancel"
								onChange={ops.setInputText}
								onSubmit={handleAction}
							/>
						)}
						{mode === "rename" && (
							<InputDialog
								title="Rename item"
								label="New Name: "
								hint="[Enter] Save    [Esc] Cancel"
								defaultValue={ops.inputText}
								onChange={ops.setInputText}
								onSubmit={handleAction}
							/>
						)}
						{mode === "help" && <HelpDialog />}
						{mode === "downloadDir" && (
							<Dialog
								borderColor={COLORS.ACCENT}
								title="Download Directory"
								hint="[Tab] Autocomplete    [Enter] Save    [Esc] Cancel"
							>
								<Box flexDirection="row" width="100%">
									<Text color={COLORS.SUCCESS}>Path: </Text>
									<Box flexGrow={1}>
										<PathInput
											value={downloadDirInput}
											onChange={setDownloadDirInput}
											onSubmit={(val) => {
												const dir = val.trim() || getDownloadDir();
												saveDownloadDir(dir);
												setMode("browse");
												nav.setStatusText(`Download directory: ${dir}`);
												nav.setStatusVariant("success");
											}}
										/>
									</Box>
								</Box>
							</Dialog>
						)}
						{mode === "update" && latestVersion && (
							<UpdateDialog latestVersion={latestVersion} />
						)}
					</Box>
				)}
				{/* The center Status Banner is removed to keep UI stable */}
			</Box>
			{/* Footer / Status Area */}
			{!isInteractiveDialog && (
				<Box
					width="100%"
					borderStyle="single"
					borderColor={COLORS.BORDER}
					borderTop
					paddingX={1}
				>
					{isBusy ? (
						<Box>
							<Spinner label={ops.phaseText || "Working"} />
							{ops.progressText !== "" && (
								<Text color={COLORS.SUCCESS} bold>
									{"  "}
									{ops.progressText}
								</Text>
							)}
						</Box>
					) : nav.statusText && mode === "browse" ? (
						<StatusMessage variant={nav.statusVariant}>
							{nav.statusText}
						</StatusMessage>
					) : (
						<Box
							flexDirection="row"
							flexWrap="wrap"
							justifyContent="center"
							flexGrow={1}
						>
							{[
								{ key: "?", label: "Help" },
								{ key: "Enter", label: "Open" },
								{ key: "Bksp", label: "Back" },
								{ key: "U", label: "Upload" },
								{ key: "Z", label: "Down" },
								{ key: "Space", label: "Select" },
								{ key: "D", label: "Delete" },
							].map((s) => (
								<Box key={s.key} marginRight={2}>
									<Text bold color={COLORS.ACCENT}>
										[{s.key}]
									</Text>
									<Text dimColor> {s.label}</Text>
								</Box>
							))}
						</Box>
					)}
				</Box>
			)}
		</Box>
	);
}
