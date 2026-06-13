import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Fuse from "fuse.js";
import { Search, FileText, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Note, VaultData } from "@/types";

function getExcerpt(plainText: string, query: string): string | null {
	if (!query.trim() || !plainText) return null;
	const lower = plainText.toLowerCase();
	const idx = lower.indexOf(query.trim().toLowerCase());
	if (idx === -1) return null;
	const start = Math.max(0, idx - 40);
	const end = Math.min(plainText.length, idx + query.length + 60);
	const excerpt = plainText.slice(start, end).replace(/\s+/g, " ").trim();
	return (start > 0 ? "…" : "") + excerpt + (end < plainText.length ? "…" : "");
}

// Renders text with the first occurrence of `query` wrapped in a highlight mark.
function Highlight({
	text,
	query,
	className,
}: {
	text: string;
	query: string;
	className?: string;
}) {
	const q = query.trim();
	if (!q) return <span className={className}>{text}</span>;
	const idx = text.toLowerCase().indexOf(q.toLowerCase());
	if (idx === -1) return <span className={className}>{text}</span>;
	return (
		<span className={className}>
			{text.slice(0, idx)}
			<mark className="rounded-[2px] bg-primary/25 text-foreground not-italic px-px">
				{text.slice(idx, idx + q.length)}
			</mark>
			{text.slice(idx + q.length)}
		</span>
	);
}

interface SearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vault: VaultData;
	onSelectNote: (note: Note) => void;
}

export function SearchDialog({
	open,
	onOpenChange,
	vault,
	onSelectNote,
}: SearchDialogProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Note[]>(() =>
		vault.notes.slice(0, 10),
	);
	const [idx, setIdx] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);

	// Full-text search index. For a non-chunked vault, plainText already lives
	// on each note. For a chunked vault, note.plainText is empty in the index,
	// so we lazily fetch search-index.json the first time the dialog opens and
	// resolve plainText from it.
	const [searchText, setSearchText] = useState<Map<string, string> | null>(
		null,
	);
	useEffect(() => {
		if (!open || !vault.chunked || searchText) return;
		let cancelled = false;
		fetch("./search-index.json")
			.then((r) => (r.ok ? r.json() : []))
			.then((entries: { id: string; plainText: string }[]) => {
				if (cancelled) return;
				setSearchText(new Map(entries.map((e) => [e.id, e.plainText])));
			})
			.catch(() => {
				if (!cancelled) setSearchText(new Map());
			});
		return () => {
			cancelled = true;
		};
	}, [open, vault.chunked, searchText]);

	const plainTextOf = useCallback(
		(note: Note) =>
			vault.chunked ? (searchText?.get(note.id) ?? "") : note.plainText,
		[vault.chunked, searchText],
	);

	const fuse = useMemo(
		() =>
			new Fuse(vault.notes, {
				keys: [
					{ name: "title", weight: 2 },
					{ name: "tags", weight: 1.5 },
				],
				threshold: 0.35,
			}),
		[vault.notes],
	);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setIdx(0);
		} else setResults(vault.notes.slice(0, 10));
	}, [open, vault.notes.slice]);

	useEffect(() => {
		if (!query.trim()) {
			setResults(vault.notes.slice(0, 10));
			setIdx(0);
			return;
		}
		const fuseHits = fuse.search(query).map((r) => r.item);
		const fuseIds = new Set(fuseHits.map((n) => n.id));
		const lq = query.toLowerCase();
		const contentHits = vault.notes.filter(
			(n) => !fuseIds.has(n.id) && plainTextOf(n).toLowerCase().includes(lq),
		);
		setResults([...fuseHits, ...contentHits].slice(0, 12));
		setIdx(0);
	}, [query, vault.notes.slice, vault.notes.filter, fuse.search, plainTextOf]);

	useEffect(() => {
		const el = listRef.current?.children[idx] as HTMLElement | undefined;
		el?.scrollIntoView({ block: "nearest" });
	}, [idx]);

	const select = useCallback(
		(note: Note) => {
			onSelectNote(note);
			onOpenChange(false);
		},
		[onSelectNote, onOpenChange],
	);

	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setIdx((i) => Math.min(i + 1, results.length - 1));
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setIdx((i) => Math.max(i - 1, 0));
		}
		if (e.key === "Enter") {
			e.preventDefault();
			if (results[idx]) select(results[idx]);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-2xl overflow-hidden p-0 gap-0"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Search</DialogTitle>

				{/* Input */}
				<div className="flex items-center gap-3 border-b border-border px-4 py-3">
					<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
					<input
						autoFocus
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKey}
						placeholder="Search notes…"
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="text-xs text-muted-foreground hover:text-foreground"
						>
							Clear
						</button>
					)}
				</div>

				{/* Results */}
				<ScrollArea className="max-h-[320px]">
					<div ref={listRef}>
						{results.length === 0 ? (
							<p className="py-12 text-center text-sm text-muted-foreground">
								No results for "{query}"
							</p>
						) : (
							results.map((note, i) => (
								<button
									type="button"
									key={note.id}
									onClick={() => select(note)}
									className={cn(
										"flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
										i === idx ? "bg-accent" : "hover:bg-accent/50",
									)}
								>
									<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
									<div className="flex-1 min-w-0">
										<p className="truncate text-sm font-medium">
											<Highlight text={note.title} query={query} />
										</p>
										{note.folder && (
											<p className="mt-0.5 truncate text-xs text-muted-foreground">
												{note.folder}
											</p>
										)}
										{(() => {
											const ex = getExcerpt(plainTextOf(note), query);
											return ex ? (
												<p className="mt-0.5 truncate text-xs text-muted-foreground/70">
													<Highlight text={ex} query={query} />
												</p>
											) : null;
										})()}
									</div>
									{i === idx && (
										<CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									)}
								</button>
							))
						)}
					</div>
				</ScrollArea>

				{/* Footer */}
				<div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
					<span>
						<kbd className="font-mono">↑↓</kbd> navigate
					</span>
					<span>
						<kbd className="font-mono">↵</kbd> open
					</span>
					<span>
						<kbd className="font-mono">esc</kbd> close
					</span>
					<span className="ml-auto">
						{results.length} result{results.length !== 1 ? "s" : ""}
					</span>
				</div>
			</DialogContent>
		</Dialog>
	);
}
