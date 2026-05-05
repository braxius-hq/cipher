// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";
import PathInput from "../PathInput";

interface Props {
	inputText: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
}

export default function UploadDialog({ inputText, onChange, onSubmit }: Props) {
	return (
		<Dialog
			borderColor={COLORS.ACCENT}
			title="Upload file or folder"
			hint="[Tab] Autocomplete    [Enter] Upload    [Esc] Cancel"
		>
			<Box flexDirection="row" width="100%">
				<Text color={COLORS.SUCCESS}>Path: </Text>
				<Box flexGrow={1}>
					<PathInput
						value={inputText}
						onChange={onChange}
						onSubmit={onSubmit}
					/>
				</Box>
			</Box>
		</Dialog>
	);
}
