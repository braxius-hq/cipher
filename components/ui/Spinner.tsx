// SPDX-License-Identifier: AGPL-3.0-only

import { Text } from "ink";
import { useEffect, useState } from "react";
import { COLORS } from "../../lib/colors";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
	label: string;
}

export default function Spinner({ label }: Props) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((f) => (f + 1) % FRAMES.length);
		}, 80);
		return () => clearInterval(interval);
	}, []);

	return (
		<Text color={COLORS.ACCENT}>
			{FRAMES[frame]} {label}
		</Text>
	);
}
