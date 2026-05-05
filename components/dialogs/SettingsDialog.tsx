// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Text } from "ink";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { COLORS } from "../../lib/colors";
import { getDownloadDir } from "../../lib/config";
import Dialog from "../Dialog";
import { Select } from "../ui";

interface Props {
	displayEmail: string;
	onLogout: () => void;
	onDownloadDir?: () => void;
}

type View = "menu" | "accountInfo";

export default function SettingsDialog({
	displayEmail,
	onLogout,
	onDownloadDir,
}: Props) {
	const [view, setView] = useState<View>("menu");
	const [accountName, setAccountName] = useState("");
	const [accountCreated, setAccountCreated] = useState("");

	if (view === "accountInfo") {
		return (
			<Dialog
				borderColor={COLORS.ACCENT}
				title="Account Info"
				hint="[Any] Back"
			>
				<Box flexDirection="column">
					<Text>
						<Text dimColor bold>
							Name:{" "}
						</Text>
						<Text>{accountName}</Text>
					</Text>
					<Text>
						<Text dimColor bold>
							Email:{" "}
						</Text>
						<Text>{displayEmail}</Text>
					</Text>
					<Text>
						<Text dimColor bold>
							Joined:
						</Text>
						<Text>{accountCreated ? ` ${accountCreated}` : ""}</Text>
					</Text>
				</Box>
			</Dialog>
		);
	}

	return (
		<Dialog borderColor={COLORS.ACCENT} title="Settings">
			<Select
				options={[
					{ label: "Account Info", value: "accountInfo" },
					{ label: `Download Dir: ${getDownloadDir()}`, value: "downloadDir" },
					{ label: "Logout", value: "logout" },
				]}
				onChange={(val) => {
					if (val === "accountInfo") {
						setView("accountInfo");
						setAccountName("Loading...");
						setAccountCreated("");
						authClient.getSession().then((res) => {
							const user = res?.data?.user;
							if (user) {
								setAccountName(user.name || user.email || "Unknown");
								const d = new Date(user.createdAt);
								setAccountCreated(
									d.toLocaleDateString("en-GB", {
										day: "numeric",
										month: "short",
										year: "numeric",
									}),
								);
							} else {
								setAccountName("Failed to load");
								setAccountCreated("");
							}
						});
					} else if (val === "downloadDir") {
						onDownloadDir?.();
					} else if (val === "logout") {
						onLogout();
					}
				}}
			/>
		</Dialog>
	);
}
