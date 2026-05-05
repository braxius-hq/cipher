// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";

function Shortcut({ keys, label }: { keys: string; label: string }) {
	return <Text>{`  ${keys.padEnd(22)}${label}`}</Text>;
}

function Divider() {
	return <Text dimColor> ──────────────────────────────────────</Text>;
}

export default function HelpDialog() {
	return (
		<Dialog borderColor={COLORS.ACCENT} title="Shortcuts" hint="[Esc] Close">
			<Box flexDirection="row">
				<Box flexDirection="column" marginRight={1}>
					<Text bold color={COLORS.ACCENT}>
						Navigation
					</Text>
					<Shortcut keys="↑↓ / jk" label="Move selection" />
					<Shortcut keys="Enter / l" label="Open file or folder" />
					<Shortcut keys="Backspace / h" label="Go to parent folder" />
					<Shortcut keys="PgUp / Ctrl+U" label="Page up" />
					<Shortcut keys="PgDn / Ctrl+D" label="Page down" />
					<Shortcut keys="Home / g" label="Jump to top" />
					<Shortcut keys="End / G" label="Jump to bottom" />
					<Divider />
					<Text bold color={COLORS.ACCENT}>
						Sort
					</Text>
					<Shortcut keys="1" label="Sort by name" />
					<Shortcut keys="2" label="Sort by size" />
					<Shortcut keys="3" label="Sort by date" />
					<Divider />
					<Text bold color={COLORS.ACCENT}>
						Selection
					</Text>
					<Shortcut keys="Space" label="Toggle select item" />
					<Shortcut keys="A" label="Select all (toggle)" />
					<Shortcut keys="Esc" label="Clear selection" />
				</Box>
				<Box flexDirection="column" marginRight={1}>
					<Text dimColor>
						{"│\n│\n│\n│\n│\n│\n│\n│\n│\n│\n│\n│\n│\n│\n│\n│"}
					</Text>
				</Box>
				<Box flexDirection="column">
					<Text bold color={COLORS.ACCENT}>
						Actions
					</Text>
					<Shortcut keys="U" label="Upload file or folder" />
					<Shortcut keys="Z" label="Download (selected)" />
					<Shortcut keys="N" label="New folder" />
					<Shortcut keys="D" label="Delete selected" />
					<Shortcut keys="R" label="Rename selected" />
					<Shortcut keys="Ctrl+R" label="Refresh" />
					<Divider />
					<Text bold color={COLORS.ACCENT}>
						Other
					</Text>
					<Shortcut keys="S" label="Settings" />
					<Shortcut keys="?" label="This help" />
					<Shortcut keys="C" label="Cancel (when busy)" />
				</Box>
			</Box>
		</Dialog>
	);
}
