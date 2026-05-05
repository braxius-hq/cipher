// SPDX-License-Identifier: AGPL-3.0-only
import Dialog from "../Dialog";
import { ConfirmInput } from "../ui";

interface Props {
	title: string;
	borderColor: string;
	titleColor: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export default function ConfirmDialog({
	title,
	borderColor,
	titleColor,
	onConfirm,
	onCancel,
}: Props) {
	return (
		<Dialog borderColor={borderColor} title={title} titleColor={titleColor}>
			<ConfirmInput onConfirm={onConfirm} onCancel={onCancel} />
		</Dialog>
	);
}
