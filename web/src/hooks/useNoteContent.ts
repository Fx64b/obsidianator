import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { VaultData } from "@/types";

interface ChunkData {
	content: string;
	plainText: string;
}

export interface NoteContentApi {
	// The vault with note content merged in for every note that has been
	// loaded. For a non-chunked vault this is the input vault unchanged.
	hydratedVault: VaultData;
	// Request content for the given note ids; fetches missing chunks in the
	// background and updates hydratedVault when they arrive. No-op for
	// non-chunked vaults.
	ensure: (ids: string[]) => void;
	// Whether a note's content is available to render. Always true for
	// non-chunked vaults.
	ready: (id: string) => boolean;
}

// Lazy per-note content loading for chunked exports. The cache lives in a ref
// (so ensure() can read the latest without being re-created on every load) and
// a version counter triggers re-derivation of the hydrated vault.
export function useNoteContent(vault: VaultData | null): NoteContentApi {
	const cacheRef = useRef<Map<string, ChunkData>>(new Map());
	const inflightRef = useRef<Set<string>>(new Set());
	const [version, setVersion] = useState(0);

	const chunked = !!vault?.chunked;

	const ensure = useCallback(
		(ids: string[]) => {
			if (!chunked) return;
			const todo = ids.filter(
				(id) => id && !cacheRef.current.has(id) && !inflightRef.current.has(id),
			);
			if (todo.length === 0) return;
			for (const id of todo) inflightRef.current.add(id);
			Promise.all(
				todo.map((id) =>
					fetch(`./notes/${encodeURIComponent(id)}.json`)
						.then((r) => (r.ok ? r.json() : null))
						.then((c: ChunkData | null) => ({ id, c }))
						.catch(() => ({ id, c: null as ChunkData | null })),
				),
			).then((results) => {
				for (const { id, c } of results) {
					cacheRef.current.set(id, {
						content: c?.content ?? "",
						plainText: c?.plainText ?? "",
					});
					inflightRef.current.delete(id);
				}
				setVersion((v) => v + 1);
			});
		},
		[chunked],
	);

	const ready = useCallback(
		(id: string) => !chunked || cacheRef.current.has(id),
		// version: re-evaluate readiness as chunks arrive
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[chunked, version],
	);

	const hydratedVault = useMemo(() => {
		if (!vault || !chunked) return vault as VaultData;
		const cache = cacheRef.current;
		return {
			...vault,
			notes: vault.notes.map((n) => {
				const c = cache.get(n.id);
				return c ? { ...n, content: c.content, plainText: c.plainText } : n;
			}),
		};
		// version: re-derive when chunks load
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [vault, chunked, version]);

	return { hydratedVault, ensure, ready };
}

// Context so deeply-nested components (hover previews) can request content
// without prop drilling. Defaults are inert for non-chunked vaults.
export const NoteContentContext = createContext<{
	ensure: (ids: string[]) => void;
	ready: (id: string) => boolean;
}>({
	ensure: () => {},
	ready: () => true,
});

export function useEnsureContent() {
	return useContext(NoteContentContext);
}
