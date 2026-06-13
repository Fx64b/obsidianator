import { useCallback, useEffect, useState } from "react";
import type { Folder, Note, VaultData } from "@/types";

function normalizeVault(raw: VaultData): VaultData {
	return {
		...raw,
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
}

export function useVaultData(): UseVaultDataResult {
	const [vault, setVault] = useState<VaultData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchVault = useCallback(() => {
		return fetch("./vault-data.json", { cache: "no-store" })
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: VaultData) => {
				setVault(normalizeVault(data));
				setLoading(false);
			})
			.catch((err: Error) => {
				setError(err.message);
				setLoading(false);
			});
	}, []);

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

	return { vault, loading, error };
}
