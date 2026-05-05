// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";
import { TextInput } from "../ui";

interface Props {
	initialValue?: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
}

export default function RenameDialog({
	initialValue,
	onChange,
	onSubmit,
}: Props) {
	return (
		<Dialog
			borderColor={COLORS.ACCENT}
			title="Rename item"
			hint="[Enter] Save    [Esc] Cancel"
		>
			<Box flexDirection="row" width="100%">
				<Text color={COLORS.SUCCESS}>New Name: </Text>
				<Box flexGrow={1}>
					<TextInput
						defaultValue={initialValue}
						onChange={onChange}
						onSubmit={onSubmit}
					/>
				</Box>
			</Box>
		</Dialog>
	);
}
