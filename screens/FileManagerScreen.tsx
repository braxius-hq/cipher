// SPDX-License-Identifier: AGPL-3.0-only

import { homedir } from "node:os";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import ConfirmDialog from "../components/dialogs/ConfirmDialog";
import HelpDialog from "../components/dialogs/HelpDialog";
import InputDialog from "../components/dialogs/InputDialog";
import SettingsDialog from "../components/dialogs/SettingsDialog";
import UploadDialog from "../components/dialogs/UploadDialog";
import FileList from "../components/FileList";
import { Spinner, StatusMessage } from "../components/ui";
import { authClient } from "../lib/auth-client";
import { COLORS } from "../lib/colors";
import {
	clearAuth,
	getDecPrivateKey,
	getMasterKey,
	getPublicKey,
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

	const selectedItem = nav.items[nav.selectedIndex];

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
			if (selectedItem && selectedItem.type !== "parent") {
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
		mode === "help";

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
				setMode("browse");
				nav.setStatusText("");
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

		if (mode === "browse") {
			if (key.upArrow || input === "k") {
				nav.moveSelection("up", nav.items.length);
			}
			if (key.downArrow || input === "j") {
				nav.moveSelection("down", nav.items.length);
			}
			if (key.return || input === "l") {
				handleAction();
			}
			if (key.backspace || key.delete || input === "h") {
				nav.goBack();
			}

			if (input === "?") setMode("help");
			if (input.toLowerCase() === "s") setMode("settings");
			if (input.toLowerCase() === "u") {
				ops.setInputText(`${homedir()}/`);
				setMode("upload");
			}
			if (input.toLowerCase() === "n") {
				ops.setInputText("");
				setMode("newFolder");
			}
			if (input.toLowerCase() === "d") {
				if (selectedItem && selectedItem.type !== "parent") {
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
				if (selectedItem?.type === "folder") {
					ops.handleFolderDownload(selectedItem.id, selectedItem.name);
				}
			}
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
						items={nav.items}
						selectedIndex={nav.selectedIndex}
						dimmed={isBusy}
						scrollOffset={nav.scrollOffset}
						visibleCount={nav.visibleCount}
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
						{mode === "deleteConfirm" && selectedForDelete && (
							<ConfirmDialog
								title={
									selectedForDelete.type === "folder"
										? `Delete '${selectedForDelete.name}' and all contents?`
										: `Delete '${selectedForDelete.name}'?`
								}
								borderColor={COLORS.ERROR}
								titleColor={COLORS.ERROR}
								onConfirm={handleAction}
								onCancel={() => setMode("browse")}
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
					</Box>
				)}
				{/* The center Status Banner is removed to keep UI stable */}
			</Box>

			{/* Footer / Status Area */}
			{latestVersion && !isInteractiveDialog && (
				<Box width="100%" paddingX={2} paddingY={0}>
					<Text color={COLORS.WARNING} dimColor>
						v{latestVersion} available — run `cipher upgrade`
					</Text>
				</Box>
			)}
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
								{ key: "Enter", label: "Open/Down" },
								{ key: "Bksp", label: "Back" },
								{ key: "U", label: "Upload" },
								{ key: "N", label: "New Dir" },
								{ key: "R", label: "Rename" },
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
