// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../../lib/colors";
import Dialog from "../Dialog";
import { TextInput } from "../ui";

interface Props {
	title: string;
	label: string;
	hint: string;
	defaultValue?: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
}

export default function InputDialog({
	title,
	label,
	hint,
	defaultValue,
	onChange,
	onSubmit,
}: Props) {
	return (
		<Dialog borderColor={COLORS.ACCENT} title={title} hint={hint}>
			<Box flexDirection="row" width="100%">
				<Text color={COLORS.SUCCESS}>{label}</Text>
				<Box flexGrow={1}>
					<TextInput
						defaultValue={defaultValue}
						onChange={onChange}
						onSubmit={onSubmit}
					/>
				</Box>
			</Box>
		</Dialog>
	);
}
