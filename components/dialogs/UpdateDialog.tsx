// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";

interface Props {
	latestVersion: string;
}

export default function UpdateDialog({ latestVersion }: Props) {
	return (
		<Dialog
			borderColor={COLORS.WARNING}
			title="Update Available"
			titleColor={COLORS.WARNING}
			hint="[Esc] Close"
		>
			<Box flexDirection="column" marginTop={1}>
				<Text>
					A new version of Cipher is available:{" "}
					<Text bold color={COLORS.SUCCESS}>
						v{latestVersion}
					</Text>
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Run the following command to update:</Text>
				</Box>
				<Box marginTop={1}>
					<Text bold color={COLORS.ACCENT}>
						cipher upgrade
					</Text>
				</Box>
			</Box>
		</Dialog>
	);
}
