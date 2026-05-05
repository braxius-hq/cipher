// SPDX-License-Identifier: AGPL-3.0-only

import { Text, useInput } from "ink";
import { useEffect, useState } from "react";

interface Props {
	onChange: (value: string) => void;
	onSubmit?: (value: string) => void;
	isDisabled?: boolean;
	defaultValue?: string;
}

export default function TextInput({
	onChange,
	onSubmit,
	isDisabled = false,
	defaultValue = "",
}: Props) {
	const [value, setValue] = useState(defaultValue);
	useEffect(() => {
		setValue(defaultValue);
	}, [defaultValue]);

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

	const cursor = isDisabled ? "" : "█";

	return (
		<Text>
			{value}
			<Text bold>{cursor}</Text>
		</Text>
	);
}
