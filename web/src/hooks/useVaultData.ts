import { useCallback, useEffect, useState } from "react";
import {
	decryptEnvelope,
	type EncryptedEnvelope,
	isEncryptedEnvelope,
} from "@/lib/decrypt";
import type { Folder, Note, VaultData } from "@/types";

function normalizeVault(raw: VaultData): VaultData {
	return {
		...raw,
		chunked: raw.chunked ?? false,
		notes: (raw.notes ?? []).map((n: Note) => ({
			...n,
			aliases: n.aliases ?? [],
			plainText: n.plainText ?? "",
			tags: n.tags ?? [],
			links: n.links ?? [],
			backlinks: n.backlinks ?? [],
			headers: n.headers ?? [],
			frontmatter: n.frontmatter ?? {},
		})),
		tags: raw.tags ?? [],
		edges: raw.edges ?? [],
		attachments: raw.attachments ?? {},
		folders: (raw.folders ?? []).map((f: Folder) => ({
			...f,
			notes: f.notes ?? [],
			children: f.children ?? [],
		})),
		canvases: (raw.canvases ?? []).map((c) => ({
			...c,
			nodes: c.nodes ?? [],
			edges: c.edges ?? [],
		})),
	};
}

interface UseVaultDataResult {
	vault: VaultData | null;
	loading: boolean;
	error: string | null;
	// Set when the export is password-protected and not yet unlocked.
	needsPassword: boolean;
	// Error from the last failed unlock attempt (e.g. wrong password).
	unlockError: string | null;
	unlocking: boolean;
	// Decrypt the loaded envelope with a password; resolves true on success.
	unlock: (password: string) => Promise<boolean>;
}

export function useVaultData(): UseVaultDataResult {
	const [vault, setVault] = useState<VaultData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [envelope, setEnvelope] = useState<EncryptedEnvelope | null>(null);
	const [unlockError, setUnlockError] = useState<string | null>(null);
	const [unlocking, setUnlocking] = useState(false);

	const fetchVault = useCallback(() => {
		return fetch("./vault-data.json", { cache: "no-store" })
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: unknown) => {
				if (isEncryptedEnvelope(data)) {
					// Locked: hold the envelope and wait for a password.
					setEnvelope(data);
					setLoading(false);
					return;
				}
				setVault(normalizeVault(data as VaultData));
				setLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

	const unlock = useCallback(
		async (password: string): Promise<boolean> => {
			if (!envelope) return false;
			setUnlocking(true);
			setUnlockError(null);
			try {
				const data = await decryptEnvelope(envelope, password);
				setVault(normalizeVault(data as VaultData));
				setUnlocking(false);
				return true;
			} catch {
				setUnlockError("Incorrect password");
				setUnlocking(false);
				return false;
			}
		},
		[envelope],
	);

	useEffect(() => {
		fetchVault();
	}, [fetchVault]);

	// SSE listener for --watch live reload.
	// Connects to /reload; if the endpoint doesn't exist (plain static serve or
	// Vite dev), the EventSource errors immediately and is silently closed.
	useEffect(() => {
		const es = new EventSource("./reload");

		es.addEventListener("message", (e) => {
			if (e.data === "reload") {
				fetchVault();
			}
		});

		es.onerror = () => {
			// /reload endpoint doesn't exist in plain static serve — close quietly.
			es.close();
		};

		return () => es.close();
	}, [fetchVault]);

	return {
		vault,
		loading,
		error,
		needsPassword: !!envelope && !vault,
		unlockError,
		unlocking,
		unlock,
	};
}
