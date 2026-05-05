// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { COLORS } from "../../lib/colors";

interface Props {
	variant: "success" | "error";
	children: ReactNode;
}

export default function StatusMessage({ variant, children }: Props) {
	const color = variant === "success" ? COLORS.SUCCESS : COLORS.ERROR;
	const icon = variant === "success" ? "✔" : "✖";

	return (
		<Box>
			<Text bold color={color}>
				{icon} {children}
			</Text>
		</Box>
	);
}
