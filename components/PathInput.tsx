// SPDX-License-Identifier: AGPL-3.0-only

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { COLORS } from "../lib/colors";
import { TextInput } from "./ui";

interface Props {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
}

interface Suggestion {
	name: string;
	isDir: boolean;
}

export default function PathInput({ value, onChange, onSubmit }: Props) {
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [totalMatches, setTotalMatches] = useState(0);
	const [keyCounter, setKeyCounter] = useState(0);

	useInput(async (_input, key) => {
		if (key.tab) {
			try {
				let searchDir = value;
				let partial = "";

				if (!value.endsWith(sep) && !value.endsWith("/") && value.length > 0) {
					searchDir = dirname(value);
					partial = basename(value);
					if (searchDir === ".") {
						searchDir = "";
					}
				}

				let actualDir = searchDir || ".";
				if (actualDir.startsWith("~")) {
					actualDir = join(homedir(), actualDir.slice(1));
				}

				const files = await readdir(actualDir).catch(() => []);
				const matches = files.filter((f) => f.startsWith(partial));

				if (matches.length === 0) {
					setSuggestions([]);
					setTotalMatches(0);
					return;
				}

				if (matches.length === 1) {
					const [match] = matches;
					if (!match) return;
					const fullPath = join(actualDir, match);
					const isDir = await stat(fullPath)
						.then((s) => s.isDirectory())
						.catch(() => false);
					const suffix = isDir ? sep : "";
					const base = value.slice(0, value.length - partial.length);
					const newValue = base + match + suffix;

					onChange(newValue);
					setKeyCounter((c) => c + 1);
					setSuggestions([]);
					setTotalMatches(0);
				} else {
					let i = 0;
					const [first] = matches;
					if (!first) return;
					while (i < first.length) {
						const char = first[i];
						if (matches.every((m) => m[i] === char)) {
							i++;
						} else {
							break;
						}
					}

					const common = first.slice(0, i);
					if (common.length > partial.length) {
						const base = value.slice(0, value.length - partial.length);
						onChange(base + common);
						setKeyCounter((c) => c + 1);
					}

					const topMatches = matches.slice(0, 10);
					const items = await Promise.all(
						topMatches.map(async (m) => {
							const isDir = await stat(join(actualDir, m))
								.then((s) => s.isDirectory())
								.catch(() => false);
							return { name: m, isDir };
						}),
					);
					setSuggestions(items);
					setTotalMatches(matches.length);
				}
			} catch (_err) {
				// Ignore filesystem errors
			}
		}
	});

	return (
		<Box flexDirection="column">
			<TextInput
				key={`path-${keyCounter}`}
				defaultValue={value}
				onChange={onChange}
				onSubmit={onSubmit}
			/>
			{suggestions.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text dimColor italic>
						Suggestions:
					</Text>
					{suggestions.map((s) => (
						<Box key={s.name}>
							<Text color={s.isDir ? COLORS.ACCENT : COLORS.TEXT_SECONDARY}>
								{process.platform === "win32"
									? s.isDir
										? "[DIR]  "
										: "[FILE] "
									: s.isDir
										? "📁 "
										: "📄 "}
							</Text>
							<Text color={s.isDir ? COLORS.ACCENT : COLORS.TEXT_SECONDARY}>
								{s.name}
							</Text>
						</Box>
					))}
					{totalMatches > suggestions.length && (
						<Text dimColor italic>
							...and {totalMatches - suggestions.length} more
						</Text>
					)}
				</Box>
			)}
		</Box>
	);
}
