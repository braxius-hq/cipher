// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";

export default function HelpDialog() {
	return (
		<Dialog borderColor={COLORS.ACCENT} title="Shortcuts" hint="[Esc] Close">
			<Box flexDirection="column">
				<Text>{`  ${"\u2191\u2193 / jk".padEnd(20)}Move selection`}</Text>
				<Text>{`  ${"Enter / l".padEnd(20)}Open file / folder`}</Text>
				<Text>{`  ${"Backspace / h".padEnd(20)}Go to parent folder`}</Text>
				<Text dimColor>{`  ${"-".repeat(32)}`}</Text>
				<Text>{`  ${"U".padEnd(20)}Upload file or folder`}</Text>
				<Text>{`  ${"Z".padEnd(20)}Download folder`}</Text>
				<Text>{`  ${"N".padEnd(20)}New folder`}</Text>
				<Text>{`  ${"D".padEnd(20)}Delete selected`}</Text>
				<Text dimColor>{`  ${"-".repeat(32)}`}</Text>
				<Text>{`  ${"R".padEnd(20)}Rename selected`}</Text>
				<Text>{`  ${"Ctrl+R".padEnd(20)}Refresh`}</Text>
				<Text>{`  ${"S".padEnd(20)}Settings`}</Text>
				<Text>{`  ${"?".padEnd(20)}This help`}</Text>
				<Text>{`  ${"Esc".padEnd(20)}Quit / Cancel`}</Text>
			</Box>
		</Dialog>
	);
}
