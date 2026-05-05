// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../lib/colors";
import { Spinner } from "./ui";

interface Props {
	phaseText: string;
	progressText: string;
}

export default function StatusBar({ phaseText, progressText }: Props) {
	return (
		<Box
			width="100%"
			borderStyle="single"
			borderColor={COLORS.BORDER}
			borderTop
			paddingX={1}
		>
			<Spinner label={phaseText} />
			{progressText !== "" && (
				<Text color={COLORS.SUCCESS} bold>
					{"  "}
					{progressText}
				</Text>
			)}
		</Box>
	);
}
