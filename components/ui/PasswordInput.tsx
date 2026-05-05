// SPDX-License-Identifier: AGPL-3.0-only

import { Text, useInput } from "ink";
import { useEffect, useState } from "react";

interface Props {
	onChange: (value: string) => void;
	onSubmit?: (value: string) => void;
	isDisabled?: boolean;
}

export default function PasswordInput({
	onChange,
	onSubmit,
	isDisabled = false,
}: Props) {
	const [value, setValue] = useState("");
	const [showCursor, setShowCursor] = useState(true);

	useEffect(() => {
		const interval = setInterval(() => {
			setShowCursor((c) => !c);
		}, 500);
		return () => clearInterval(interval);
	}, []);

	useInput((input, key) => {
		if (isDisabled) return;

		if (key.return) {
			onSubmit?.(value);
			return;
		}

		if (key.backspace) {
			const newValue = value.slice(0, -1);
			setValue(newValue);
			onChange(newValue);
			return;
		}

		if (key.delete) {
			const newValue = value.slice(0, -1);
			setValue(newValue);
			onChange(newValue);
			return;
		}

		if (key.tab) {
			return;
		}

		if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
			return;
		}

		if (input && input.length === 1 && !key.ctrl && !key.meta) {
			const newValue = value + input;
			setValue(newValue);
			onChange(newValue);
		}
	});

	const masked = "*".repeat(value.length);
	const cursor = isDisabled ? "" : showCursor ? "█" : "";

	return (
		<Text>
			{masked}
			<Text bold>{cursor}</Text>
		</Text>
	);
}
