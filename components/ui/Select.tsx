// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { COLORS } from "../../lib/colors";

interface Option {
	label: string;
	value: string;
}

interface Props {
	options: Option[];
	onChange: (value: string) => void;
}

export default function Select({ options, onChange }: Props) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	useInput((input, key) => {
		if (key.upArrow || input === "k") {
			setSelectedIndex((i) => (i > 0 ? i - 1 : options.length - 1));
		}
		if (key.downArrow || input === "j") {
			setSelectedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
		}
		if (key.return || input === "l") {
			const option = options[selectedIndex];
			if (option) {
				onChange(option.value);
			}
		}
	});

	return (
		<Box flexDirection="column">
			{options.map((opt, i) => {
				const isSelected = i === selectedIndex;
				return (
					<Box
						key={opt.value}
						backgroundColor={isSelected ? COLORS.ACCENT_BG : undefined}
						paddingX={1}
					>
						<Text
							color={isSelected ? COLORS.ACCENT_TEXT : undefined}
							bold={isSelected}
						>
							{opt.label}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
