// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Text } from "ink";
import type React from "react";

interface Props {
	borderColor: string;
	title?: string;
	titleColor?: string;
	children?: React.ReactNode;
	hint?: string;
}

export default function Dialog({
	borderColor,
	title,
	titleColor,
	children,
	hint,
}: Props) {
	return (
		<Box flexGrow={1} justifyContent="center" alignItems="center">
			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor={borderColor}
				paddingX={3}
				paddingY={1}
			>
				{title && (
					<Text bold color={titleColor ?? borderColor}>
						{title}
					</Text>
				)}
				{children}
				{hint && (
					<Box marginTop={1}>
						<Text dimColor>{hint}</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
}
