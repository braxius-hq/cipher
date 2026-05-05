// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Text } from "ink";
import React from "react";
import { COLORS } from "../lib/colors";

interface Shortcut {
	key: string;
	action: string;
}

interface Props {
	shortcuts: Shortcut[];
}

export default function Footer({ shortcuts }: Props) {
	return (
		<Box
			width="100%"
			borderStyle="single"
			borderColor={COLORS.BORDER}
			borderTop
			paddingX={1}
			justifyContent="center"
		>
			<Text dimColor>
				{shortcuts.map((s, i) => (
					<React.Fragment key={`${s.key}-${s.action}`}>
						{i > 0 ? <Text>{"  "}</Text> : null}
						<Text>[</Text>
						<Text bold>{s.key}</Text>
						<Text>] {s.action}</Text>
					</React.Fragment>
				))}
			</Text>
		</Box>
	);
}
