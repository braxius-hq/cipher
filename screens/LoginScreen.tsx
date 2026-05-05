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
import { apiGet, apiPath } from "../lib/api";
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
import { decryptPrivateKey, deriveLoginKeys } from "../lib/crypto";
import type { AuthUser } from "../lib/types";
import { toHex } from "../lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
	onSuccess: (email: string) => void;
	onBack: () => void;
}

export default function LoginScreen({ onSuccess, onBack }: Props) {
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [status, setStatus] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const fieldCount = 3; // email, password, submit

	useInput((_input, key) => {
		if (isSubmitting) return;

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
		if (!password) {
			setError("Enter your password");
			setFocusedIndex(1);
			return;
		}

		setError("");
		setIsSubmitting(true);

		try {
			setStatus("Authenticating...");
			const { res: saltRes, data: saltData } = await apiGet<{ salt?: string }>(
				`${apiPath("/crypto/get-salt")}?email=${encodeURIComponent(email)}`,
			);
			if (!saltRes.ok || !saltData?.salt) {
				throw new Error("Email or password is incorrect");
			}

			setStatus("Deriving keys...");
			const loginKeys = await deriveLoginKeys(password, saltData.salt);

			setStatus("Signing in...");
			const { data, error: signInError } = await authClient.signIn.email({
				email,
				password: loginKeys.loginTokenHex,
			});

			if (signInError || !data?.user) {
				throw new Error(signInError?.message || "Sign in failed — try again");
			}

			const user = data.user as unknown as AuthUser;

			setStatus("Decrypting keys...");
			const decPrivateKey = await decryptPrivateKey(
				user.encPrivateKey,
				user.iv,
				loginKeys.masterKeyBytes,
			);

			await setPublicKey(user.publicKey);
			await setEncPrivateKey(user.encPrivateKey);
			await setDecPrivateKey(toHex(decPrivateKey));
			await setSalt(user.salt);
			await setIv(user.iv);
			await setMasterKey(toHex(loginKeys.masterKeyBytes));

			onSuccess(data.user.email || email);
		} catch (err) {
			const msg = err instanceof Error ? err.message.toLowerCase() : "";
			if (
				msg.includes("email not verified") ||
				msg.includes("email_not_verified")
			) {
				setError("Email not verified — check your inbox");
			} else {
				setError(
					err instanceof Error ? err.message : "Sign in failed — try again",
				);
			}
			setIsSubmitting(false);
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
				<Text dimColor>Login</Text>
			</Box>

			<Box
				flexGrow={1}
				flexDirection="column"
				justifyContent="center"
				alignItems="center"
				paddingY={1}
			>
				{isSubmitting ? (
					<Box
						flexDirection="column"
						borderStyle="single"
						borderColor={COLORS.ACCENT}
						paddingX={3}
						paddingY={1}
					>
						<Spinner label={status} />
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
										color={
											focusedIndex === 1 ? COLORS.ACCENT : COLORS.TEXT_SECONDARY
										}
										bold={focusedIndex === 1}
									>
										Password:
									</Text>
								</Box>
								<Box flexGrow={1}>
									<PasswordInput
										onChange={setPassword}
										onSubmit={handleSubmit}
										isDisabled={focusedIndex !== 1}
									/>
								</Box>
							</Box>
						</Box>

						<Box marginTop={1} justifyContent="center">
							<Box
								borderStyle={focusedIndex === 2 ? "bold" : "single"}
								borderColor={focusedIndex === 2 ? COLORS.ACCENT : COLORS.BORDER}
								backgroundColor={
									focusedIndex === 2 ? COLORS.ACCENT_BG : undefined
								}
								paddingX={2}
							>
								<Text
									bold
									color={
										focusedIndex === 2
											? COLORS.ACCENT_TEXT
											: COLORS.TEXT_SECONDARY
									}
								>
									Login
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

			{!isSubmitting && <Footer shortcuts={footerShortcuts} />}
		</Box>
	);
}
