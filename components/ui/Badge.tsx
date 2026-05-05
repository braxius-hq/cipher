// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { COLORS } from "../../lib/colors";

interface Props {
	color: string;
	children: ReactNode;
}

export default function Badge({ color, children }: Props) {
	return (
		<Box backgroundColor={color} paddingX={1}>
			<Text bold color={COLORS.ACCENT_TEXT}>
				{children}
			</Text>
		</Box>
	);
}
