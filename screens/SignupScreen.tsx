// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import Footer from "../components/Footer";
import {
	PasswordInput,
	Spinner,
	StatusMessage,
	TextInput,
} from "../components/ui";
import { authClient } from "../lib/auth-client";
import { COLORS } from "../lib/colors";
import {
	setDecPrivateKey,
	setEncPrivateKey,
	setIv,
	setMasterKey,
	setPublicKey,
	setSalt,
} from "../lib/config";
import { generateSignupKeys } from "../lib/crypto";
import { toHex } from "../lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
	onBack: () => void;
}

type SignupMode = "form" | "submitting" | "verificationSent";

export default function SignupScreen({ onBack }: Props) {
	const [mode, setMode] = useState<SignupMode>("form");
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [status, setStatus] = useState("");

	const fieldCount = 5; // email, password, confirm, name, submit

	useInput((_input, key) => {
		if (mode === "submitting") return;

		if (mode === "verificationSent") {
			onBack();
			return;
		}

		if (key.escape) {
			onBack();
			return;
		}

		if (key.tab) {
			const dir = key.shift ? -1 : 1;
			setFocusedIndex((i) => (i + dir + fieldCount) % fieldCount);
			return;
		}

		if (key.return && focusedIndex === fieldCount - 1) {
			handleSubmit();
		}
	});

	const advance = () => setFocusedIndex((i) => Math.min(i + 1, fieldCount - 1));

	const handleSubmit = async () => {
		if (!EMAIL_RE.test(email)) {
			setError("Enter a valid email address");
			setFocusedIndex(0);
			return;
		}
		if (password.length < 8) {
			setError("Password must be 8+ characters");
			setFocusedIndex(1);
			return;
		}
		if (confirmPassword !== password) {
			setError("Passwords don't match");
			setFocusedIndex(2);
			return;
		}
		if (!name.trim()) {
			setError("Enter your name");
			setFocusedIndex(3);
			return;
		}

		setError("");
		setMode("submitting");

		try {
			setStatus("Deriving encryption keys...");
			const keys = await generateSignupKeys(password);

			setStatus("Creating account...");
			const { error: signUpError } = await authClient.signUp.email({
				email,
				password: keys.loginTokenHex,
				name: name.trim(),
				publicKey: keys.publicKeyHex,
				encPrivateKey: keys.encryptedPrivateKeyHex,
				salt: keys.saltHex,
				iv: keys.ivHex,
			});

			if (signUpError) {
				throw new Error(
					signUpError.message || "Could not create account — try again",
				);
			}

			await setPublicKey(keys.publicKeyHex);
			await setEncPrivateKey(keys.encryptedPrivateKeyHex);
			await setSalt(keys.saltHex);
			await setIv(keys.ivHex);
			await setMasterKey(toHex(keys.masterKeyBytes));
			await setDecPrivateKey(toHex(keys.privateKey));

			setMode("verificationSent");
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: "Could not create account — try again";
			setError(msg);
			setMode("form");
		}
	};

	const footerShortcuts = useMemo(
		() => [
			{ key: "Tab", action: "Next" },
			{ key: "Shift+Tab", action: "Prev" },
			{ key: "Enter", action: "Next/Accept" },
			{ key: "Esc", action: "Back" },
		],
		[],
	);

	return (
		<Box flexDirection="column" width="100%" flexGrow={1} paddingX={1}>
			<Box
				flexDirection="row"
				justifyContent="space-between"
				borderBottom
				borderStyle="single"
				borderColor={COLORS.BORDER}
				paddingX={1}
			>
				<Text bold color={COLORS.ACCENT}>
					Cipher
				</Text>
				<Text dimColor>Create Account</Text>
			</Box>

			<Box
				flexGrow={1}
				flexDirection="column"
				justifyContent="center"
				alignItems="center"
				paddingY={1}
			>
				{mode === "submitting" ? (
					<Box
						flexDirection="column"
						borderStyle="single"
						borderColor={COLORS.ACCENT}
						paddingX={3}
						paddingY={1}
					>
						<Spinner label={status} />
					</Box>
				) : mode === "verificationSent" ? (
					<Box
						flexDirection="column"
						borderStyle="single"
						borderColor={COLORS.SUCCESS}
						paddingX={3}
						paddingY={1}
					>
						<Text bold color={COLORS.SUCCESS}>
							Account created
						</Text>
						<Text dimColor>Check your email to verify your account.</Text>
						<Box marginTop={1}>
							<Text dimColor>Press any key to return to menu</Text>
						</Box>
					</Box>
				) : (
					<Box flexDirection="column" width={50} paddingX={2}>
						<Box flexDirection="column">
							<Box flexDirection="row" alignItems="center">
								<Box width={12}>
									<Text
										color={
											focusedIndex === 0 ? COLORS.ACCENT : COLORS.TEXT_SECONDARY
										}
										bold={focusedIndex === 0}
									>
										Email:
									</Text>
								</Box>
								<Box flexGrow={1}>
									<TextInput
										onChange={setEmail}
										onSubmit={advance}
										isDisabled={focusedIndex !== 0}
									/>
								</Box>
							</Box>

							<Box flexDirection="row" alignItems="center" marginTop={1}>
								<Box width={12}>
									<Text
										color={focusedIndex === 1 ? "cyan" : "gray"}
										bold={focusedIndex === 1}
									>
										Password:
									</Text>
								</Box>
								<Box flexGrow={1}>
									<PasswordInput
										onChange={setPassword}
										onSubmit={advance}
										isDisabled={focusedIndex !== 1}
									/>
								</Box>
							</Box>

							<Box flexDirection="row" alignItems="center" marginTop={1}>
								<Box width={12}>
									<Text
										color={focusedIndex === 2 ? "cyan" : "gray"}
										bold={focusedIndex === 2}
									>
										Confirm:
									</Text>
								</Box>
								<Box flexGrow={1}>
									<PasswordInput
										onChange={setConfirmPassword}
										onSubmit={advance}
										isDisabled={focusedIndex !== 2}
									/>
								</Box>
							</Box>

							<Box flexDirection="row" alignItems="center" marginTop={1}>
								<Box width={12}>
									<Text
										color={focusedIndex === 3 ? "cyan" : "gray"}
										bold={focusedIndex === 3}
									>
										Name:
									</Text>
								</Box>
								<Box flexGrow={1}>
									<TextInput
										onChange={setName}
										onSubmit={handleSubmit}
										isDisabled={focusedIndex !== 3}
									/>
								</Box>
							</Box>
						</Box>

						<Box marginTop={1} justifyContent="center">
							<Box
								borderStyle={focusedIndex === 4 ? "bold" : "single"}
								borderColor={focusedIndex === 4 ? COLORS.ACCENT : COLORS.BORDER}
								backgroundColor={
									focusedIndex === 4 ? COLORS.ACCENT_BG : undefined
								}
								paddingX={2}
							>
								<Text
									bold
									color={
										focusedIndex === 4
											? COLORS.ACCENT_TEXT
											: COLORS.TEXT_SECONDARY
									}
								>
									Create Account
								</Text>
							</Box>
						</Box>

						{error && (
							<Box marginTop={1}>
								<StatusMessage variant="error">{error}</StatusMessage>
							</Box>
						)}
					</Box>
				)}
			</Box>

			{mode === "form" && <Footer shortcuts={footerShortcuts} />}
		</Box>
	);
}
