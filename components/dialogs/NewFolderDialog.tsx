// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";
import { TextInput } from "../ui";

interface Props {
	onChange: (v: string) => void;
	onSubmit: () => void;
}

export default function NewFolderDialog({ onChange, onSubmit }: Props) {
	return (
		<Dialog
			borderColor={COLORS.ACCENT}
			title="New folder"
			hint="[Enter] Create    [Esc] Cancel"
		>
			<Box flexDirection="row" width="100%">
				<Text color={COLORS.SUCCESS}>Name: </Text>
				<Box flexGrow={1}>
					<TextInput onChange={onChange} onSubmit={onSubmit} />
				</Box>
			</Box>
		</Dialog>
	);
}
