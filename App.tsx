// SPDX-License-Identifier: AGPL-3.0-only

import { Box, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import { Spinner } from "./components/ui";
import { COLORS } from "./lib/colors";
import { getBearerToken } from "./lib/config";
import { checkForUpdate } from "./lib/upgrade";
import FileManagerScreen from "./screens/FileManagerScreen";
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import WelcomeScreen from "./screens/WelcomeScreen";

type Screen = "welcome" | "login" | "signup" | "status";

export default function App() {
	const { rows } = useWindowSize();
	const [screen, setScreen] = useState<Screen>("welcome");
	const [isReady, setIsReady] = useState(false);
	const [updateVersion, setUpdateVersion] = useState<string | null>(null);

	useEffect(() => {
		getBearerToken().then((token) => {
			if (token) {
				setScreen("status");
			}
			setIsReady(true);
		});
	}, []);

	useEffect(() => {
		if (!isReady) return;
		checkForUpdate().then((latest) => {
			if (latest) setUpdateVersion(latest);
		});
	}, [isReady]);

	if (!isReady) {
		return (
			<Box
				flexDirection="column"
				width="100%"
				height={rows}
				justifyContent="center"
				alignItems="center"
			>
				<Spinner label="Cipher" />
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			height={rows}
			width="100%"
			borderStyle="single"
			borderColor={COLORS.ACCENT}
		>
			{screen === "welcome" && (
				<WelcomeScreen
					onLogin={() => setScreen("login")}
					onSignup={() => setScreen("signup")}
					latestVersion={updateVersion}
				/>
			)}
			{screen === "login" && (
				<LoginScreen
					onSuccess={() => {
						setScreen("status");
					}}
					onBack={() => setScreen("welcome")}
				/>
			)}
			{screen === "signup" && (
				<SignupScreen
					onSuccess={() => setScreen("status")}
					onBack={() => setScreen("welcome")}
				/>
			)}
			{screen === "status" && (
				<FileManagerScreen
					onLogout={() => setScreen("welcome")}
					latestVersion={updateVersion}
				/>
			)}
		</Box>
	);
}
