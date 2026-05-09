// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text } from "ink";
import { COLORS } from "../lib/colors";
import { formatBytes } from "../lib/formatting";
import { isWindows } from "../lib/platform";
import type { DisplayItem, SortDir, SortKey } from "../lib/types";

interface Props {
	items: DisplayItem[];
	selectedIndex: number;
	dimmed: boolean;
	scrollOffset: number;
	visibleCount: number;
	selectedIds: Set<string>;
	sortKey: SortKey;
	sortDir: SortDir;
}

export default function FileList({
	items,
	selectedIndex,
	dimmed,
	scrollOffset,
	visibleCount,
	selectedIds,
	sortKey,
	sortDir,
}: Props) {
	if (items.length === 0) {
		return (
			<Box flexGrow={1} justifyContent="center" alignItems="center">
				<Text dimColor>Folder is empty. Press 'U' to upload.</Text>
			</Box>
		);
	}

	const end = Math.min(scrollOffset + visibleCount, items.length);

	const showScrollbar = items.length > visibleCount;
	let thumbSize = 0;
	let thumbPos = 0;

	if (showScrollbar) {
		thumbSize = Math.max(
			1,
			Math.round((visibleCount / items.length) * visibleCount),
		);
		thumbPos = Math.round(
			(scrollOffset / (items.length - visibleCount)) *
				(visibleCount - thumbSize),
		);
	}

	const sortIndicator = (key: SortKey, label: string) => {
		const active = sortKey === key;
		const arrow = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
		return (
			<Text
				bold={active}
				underline={active}
				color={active ? COLORS.ACCENT : undefined}
			>
				{label}
				{arrow}
			</Text>
		);
	};

	return (
		<Box flexDirection="row" width="100%">
			<Box flexDirection="column" flexGrow={1}>
				<Box flexDirection="row" paddingX={1} marginBottom={1}>
					<Box width={2} />
					<Box flexGrow={1}>{sortIndicator("name", "Name")}</Box>
					<Box width={12} justifyContent="flex-end" marginRight={2}>
						{sortIndicator("size", "Size")}
					</Box>
					<Box width={14} justifyContent="flex-end">
						{sortIndicator("date", "Modified")}
					</Box>
				</Box>
				{items.slice(scrollOffset, end).map((item, i) => {
					const actualIndex = scrollOffset + i;
					const isSelected = actualIndex === selectedIndex;
					const isChecked = selectedIds.has(item.id);
					const win = isWindows();
					let icon = win ? "[FILE]" : "📄";
					let baseColor: string | undefined;

					if (item.type === "folder") {
						icon = win ? "[DIR]" : "📁";
						baseColor = COLORS.ACCENT;
					}
					if (item.type === "parent") {
						icon = "⌂";
						baseColor = COLORS.TEXT_SECONDARY;
					}

					const bgColor = isSelected && !dimmed ? COLORS.ACCENT_BG : undefined;
					const textColor =
						isSelected && !dimmed
							? COLORS.ACCENT_TEXT
							: dimmed
								? COLORS.TEXT_SECONDARY
								: baseColor;
					const metaColor =
						isSelected && !dimmed ? COLORS.ACCENT_TEXT : COLORS.TEXT_SECONDARY;

					const checkMark =
						item.type !== "parent" ? (isChecked ? "■" : "□") : " ";

					return (
						<Box
							key={`${item.id}-${isSelected}`}
							flexDirection="row"
							width="100%"
							paddingX={1}
							backgroundColor={bgColor}
						>
							<Box width={2}>
								<Text color={isChecked ? COLORS.SUCCESS : metaColor}>
									{checkMark}
								</Text>
							</Box>
							<Box flexGrow={1}>
								<Text
									color={textColor}
									bold={!dimmed && (isSelected || item.type !== "file")}
								>
									{icon} {item.name}
								</Text>
							</Box>
							<Box width={12} justifyContent="flex-end" marginRight={2}>
								{item.type === "file" && item.size !== undefined ? (
									<Text color={metaColor}>{formatBytes(item.size, 0)}</Text>
								) : null}
							</Box>
							<Box width={14} justifyContent="flex-end">
								{item.date ? <Text color={metaColor}>{item.date}</Text> : null}
							</Box>
						</Box>
					);
				})}
			</Box>
			{showScrollbar && (
				<Box flexDirection="column" width={1} marginLeft={1} marginTop={1}>
					{Array.from({ length: visibleCount }, (_, position) => ({
						key: `scrollbar-${position}`,
						position,
					})).map(({ key, position }) => {
						const isThumb =
							position >= thumbPos && position < thumbPos + thumbSize;
						return (
							<Text key={key} color={isThumb ? "cyan" : "gray"}>
								{isThumb ? "█" : "│"}
							</Text>
						);
					})}
				</Box>
			)}
		</Box>
	);
}
