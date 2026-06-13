import { useState } from "react";
import { Lock } from "lucide-react";

interface PasswordPromptProps {
	onUnlock: (password: string) => void;
	error: string | null;
	busy: boolean;
	vaultName?: string;
}

// Shown when the export is password-protected and still locked. The vault
// content never reaches the browser until the password decrypts it locally.
export function PasswordPrompt({
	onUnlock,
	error,
	busy,
	vaultName,
}: PasswordPromptProps) {
	const [password, setPassword] = useState("");

	return (
		<div className="flex h-screen items-center justify-center bg-background px-4">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (password && !busy) onUnlock(password);
				}}
				className="w-full max-w-xs space-y-4 text-center"
			>
				<div className="flex flex-col items-center gap-2">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
						<Lock className="h-5 w-5 text-muted-foreground" />
					</div>
					<h1 className="text-sm font-semibold">
						{vaultName ? `${vaultName} is locked` : "This vault is locked"}
					</h1>
					<p className="text-xs text-muted-foreground">
						Enter the password to decrypt it in your browser.
					</p>
				</div>
				<input
					type="password"
					autoFocus
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="Password"
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30"
				/>
				{error && <p className="text-xs text-destructive">{error}</p>}
				<button
					type="submit"
					disabled={!password || busy}
					className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
				>
					{busy ? "Decrypting…" : "Unlock"}
				</button>
			</form>
		</div>
	);
}
