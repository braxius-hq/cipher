// SPDX-License-Identifier: AGPL-3.0-only
import { Text, useInput } from "ink";

interface Props {
	onConfirm: () => void;
	onCancel: () => void;
}

export default function ConfirmInput({ onConfirm, onCancel }: Props) {
	useInput((input, key) => {
		if (input === "y" || input === "Y" || key.return) {
			onConfirm();
		}
		if (input === "n" || input === "N" || key.escape) {
			onCancel();
		}
	});

	return (
		<Text dimColor>
			{" "}
			[<Text bold>Y</Text>/n]{" "}
		</Text>
	);
}
