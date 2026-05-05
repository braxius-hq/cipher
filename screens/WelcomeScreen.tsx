// SPDX-License-Identifier: AGPL-3.0-only
import { Box, Text, useInput } from "ink";
import { Badge, Select } from "../components/ui";
import { COLORS } from "../lib/colors";
import packageJson from "../package.json";

interface Props {
	onLogin: () => void;
	onSignup: () => void;
	latestVersion?: string | null;
}

export default function WelcomeScreen({
	onLogin,
	onSignup,
	latestVersion,
}: Props) {
	useInput((_input, key) => {
		if (key.escape) {
			process.exit(0);
		}
	});

	return (
		<Box flexDirection="column" width="100%" flexGrow={1} paddingX={1}>
			<Box
				flexGrow={1}
				flexDirection="column"
				justifyContent="center"
				alignItems="center"
				paddingY={1}
			>
				<Box flexDirection="column" alignItems="center">
					<Text color={COLORS.ACCENT}>
						{`
 ██████╗██╗██████╗ ██╗  ██╗███████╗██████╗
██╔════╝██║██╔══██╗██║  ██║██╔════╝██╔══██╗
██║     ██║██████╔╝███████║█████╗  ██████╔╝
██║     ██║██╔═══╝ ██╔══██║██╔══╝  ██╔══██╗
╚██████╗██║██║     ██║  ██║███████╗██║  ██║
 ╚═════╝╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝`}
					</Text>
					<Box marginTop={1}>
						<Badge color={COLORS.SUCCESS}>Encrypted. Private. Yours.</Badge>
					</Box>
				</Box>
				<Box marginTop={1}>
					<Select
						options={[
							{ label: "Log in", value: "login" },
							{ label: "Create account", value: "signup" },
							{ label: "Quit", value: "quit" },
						]}
						onChange={(value) => {
							if (value === "login") onLogin();
							if (value === "signup") onSignup();
							if (value === "quit") process.exit(0);
						}}
					/>
				</Box>
			</Box>

			<Box justifyContent="flex-end" paddingX={2} marginBottom={0}>
				<Text dimColor>v{packageJson.version}</Text>
			</Box>
			{latestVersion && (
				<Box justifyContent="flex-end" paddingX={2}>
					<Text color={COLORS.WARNING}>
						v{latestVersion} available — run `cipher upgrade`
					</Text>
				</Box>
			)}
		</Box>
	);
}
