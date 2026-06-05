import {
	useState,
	useEffect,
	useLayoutEffect,
	useCallback,
	useRef,
} from "react";
import githubCss from "highlight.js/styles/github.css?inline";
import githubDarkCss from "highlight.js/styles/github-dark.css?inline";
import {
	Search,
	GitGraph,
	FileText,
	Moon,
	Sun,
	PanelLeft,
	PanelRight,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { SearchDialog } from "@/components/SearchDialog";
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { useVaultData } from "@/hooks/useVaultData";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/lib/utils";

type View = "notes" | "graph";

export default function App() {
	const { vault, loading, error } = useVaultData();
	const [view, setView] = useState<View>("notes");
	const [searchOpen, setSearchOpen] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useLocalStorage(
		"sidebar-open",
		window.innerWidth >= 768,
	);
	const [rightSidebarOpen, setRightSidebarOpen] = useLocalStorage(
		"right-sidebar-open",
		window.innerWidth >= 1024,
	);
	const [dark, setDark] = useLocalStorage(
		"dark-mode",
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
	const [activeNoteId, setActiveNoteId] = useLocalStorage<string | null>(
		"active-note-id",
		null,
	);
	const [activeTag, setActiveTag] = useLocalStorage<string | null>(
		"active-tag",
		null,
	);
	const [sidebarTab, setSidebarTab] = useLocalStorage<"files" | "tags">(
		"sidebar-tab",
		"files",
	);

	// History stack: [{noteId, anchor}], cursor points to current entry
	const historyRef = useRef<{ noteId: string; anchor?: string }[]>([]);
	const cursorRef = useRef(-1);
	const navigatingRef = useRef(false); // true when back/fwd triggers a note change

	const canBack = cursorRef.current > 0;
	const canFwd = cursorRef.current < historyRef.current.length - 1;
	// Dummy state to force re-render when history changes
	const [, setHistoryVersion] = useState(0);
	const bumpHistory = useCallback(() => setHistoryVersion((v) => v + 1), []);

	const pushHistory = useCallback(
		(noteId: string, anchor?: string) => {
			if (navigatingRef.current) return;
			const stack = historyRef.current;
			const cursor = cursorRef.current;
			const cur = stack[cursor];
			// Avoid duplicate consecutive entries
			if (cur && cur.noteId === noteId && cur.anchor === anchor) return;
			// Truncate forward entries
			historyRef.current = [
				...stack.slice(0, cursor + 1),
				{ noteId, anchor },
			].slice(-50);
			cursorRef.current = historyRef.current.length - 1;
			bumpHistory();
		},
		[bumpHistory],
	);

	const goBack = useCallback(() => {
		if (cursorRef.current <= 0) return;
		cursorRef.current--;
		const entry = historyRef.current[cursorRef.current];
		navigatingRef.current = true;
		setActiveNoteId(entry.noteId);
		navigatingRef.current = false;
		bumpHistory();
	}, [setActiveNoteId, bumpHistory]);

	const goForward = useCallback(() => {
		if (cursorRef.current >= historyRef.current.length - 1) return;
		cursorRef.current++;
		const entry = historyRef.current[cursorRef.current];
		navigatingRef.current = true;
		setActiveNoteId(entry.noteId);
		navigatingRef.current = false;
		bumpHistory();
	}, [setActiveNoteId, bumpHistory]);

	const handleTagClick = useCallback(
		(tag: string) => {
			setActiveTag(tag);
			setSidebarTab("tags");
			setSidebarOpen(true);
		},
		[setActiveTag, setSidebarTab, setSidebarOpen],
	);

	useLayoutEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
		let style = document.getElementById(
			"hljs-theme",
		) as HTMLStyleElement | null;
		if (!style) {
			style = document.createElement("style");
			style.id = "hljs-theme";
			document.head.appendChild(style);
		}
		style.textContent = dark ? githubDarkCss : githubCss;
	}, [dark]);

	// Sync active note from URL hash on vault load (initial mount + live reload).
	// Must NOT depend on activeNoteId — otherwise it fights the hash-writer effect
	// below and creates an infinite A↔B loop on in-app back/forward navigation,
	// where the hash and activeNoteId are briefly out of sync.
	useEffect(() => {
		if (!vault || vault.notes.length === 0) return;
		const hashId = location.hash.slice(1);
		const fromHash = hashId ? vault.notes.find((n) => n.id === hashId) : null;
		if (fromHash) {
			setActiveNoteId(fromHash.id);
		} else if (
			!activeNoteId ||
			!vault.notes.find((n) => n.id === activeNoteId)
		) {
			setActiveNoteId(vault.notes[0].id);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [vault]);

	// Keep hash in sync whenever activeNoteId changes
	useEffect(() => {
		if (!activeNoteId) return;
		const desired = `#${activeNoteId}`;
		if (location.hash !== desired) history.replaceState(null, "", desired);
	}, [activeNoteId]);

	// Handle browser back/forward (hash change from browser chrome or external link)
	useEffect(() => {
		if (!vault) return;
		const onHash = () => {
			const id = location.hash.slice(1);
			if (id && vault.notes.find((n) => n.id === id)) setActiveNoteId(id);
		};
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, [vault, setActiveNoteId]);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setSearchOpen(true);
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "g") {
				e.preventDefault();
				setView((v) => (v === "graph" ? "notes" : "graph"));
			}
			if (e.altKey && e.key === "ArrowLeft") {
				e.preventDefault();
				goBack();
			}
			if (e.altKey && e.key === "ArrowRight") {
				e.preventDefault();
				goForward();
			}
		};
		window.addEventListener("keydown", down);
		return () => window.removeEventListener("keydown", down);
	}, [goBack, goForward]);

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
					<span className="text-sm text-muted-foreground">Loading vault…</span>
				</div>
			</div>
		);
	}

	if (error || !vault) {
		return (
			<div className="flex h-screen items-center justify-center bg-background">
				<div className="max-w-sm space-y-2 text-center">
					<p className="font-medium">Failed to load vault</p>
					<p className="text-sm text-muted-foreground">
						{error ?? "vault-data.json not found"}
					</p>
					<code className="block rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground mt-3">
						obsidianator export &lt;vault&gt; --serve
					</code>
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-screen flex-col bg-background overflow-hidden">
				{/* ── Top bar ──────────────────────────────────────────────────── */}
				<header className="flex h-12 shrink-0 items-center gap-1 overflow-hidden border-b border-border px-2 sm:gap-2 sm:px-3">
					{/* Sidebar toggle */}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => setSidebarOpen((v) => !v)}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<PanelLeft className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent>
							{sidebarOpen ? "Hide sidebar" : "Show sidebar"}
						</TooltipContent>
					</Tooltip>

					{/* Back / Forward */}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={goBack}
								disabled={!canBack}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent>
							Back <kbd className="ml-1 font-mono text-[10px]">Alt+←</kbd>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={goForward}
								disabled={!canFwd}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
							>
								<ChevronRight className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent>
							Forward <kbd className="ml-1 font-mono text-[10px]">Alt+→</kbd>
						</TooltipContent>
					</Tooltip>

					{/* Brand */}
					<div className="flex min-w-0 items-center gap-1.5 select-none">
						<img
							src="/logo.svg"
							alt=""
							className={cn("h-5 w-auto shrink-0", dark && "invert")}
						/>
						<span className="hidden text-sm font-semibold tracking-tight sm:inline">
							Obsidianator
						</span>
						{vault.name && (
							<>
								<span className="hidden text-border sm:inline">/</span>
								<span className="max-w-[120px] truncate text-sm text-muted-foreground sm:max-w-[160px]">
									{vault.name}
								</span>
							</>
						)}
					</div>

					<div className="min-w-[8px] flex-1" />

					{/* View toggle — segmented control */}
					<div className="flex shrink-0 items-center rounded-md border border-border bg-muted p-0.5">
						{(["notes", "graph"] as const).map((v) => (
							<button
								type="button"
								key={v}
								onClick={() => setView(v)}
								className={cn(
									"flex h-6 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-all",
									view === v
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{v === "notes" ? (
									<FileText className="h-3.5 w-3.5" />
								) : (
									<GitGraph className="h-3.5 w-3.5" />
								)}
								<span className="hidden sm:inline capitalize">{v}</span>
							</button>
						))}
					</div>

					{/* Search */}
					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						className="flex h-7 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:px-2.5"
					>
						<Search className="h-3.5 w-3.5" />
						<span className="hidden sm:inline">Search…</span>
						<kbd className="hidden sm:flex items-center gap-0.5 rounded border border-border bg-muted px-1 py-px font-mono text-[10px]">
							⌘K
						</kbd>
					</button>

					{/* Theme toggle */}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => setDark((d) => !d)}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								{dark ? (
									<Sun className="h-4 w-4" />
								) : (
									<Moon className="h-4 w-4" />
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
					</Tooltip>

					{/* Right sidebar toggle */}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => setRightSidebarOpen((v) => !v)}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<PanelRight className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent>
							{rightSidebarOpen ? "Hide panel" : "Show panel"}
						</TooltipContent>
					</Tooltip>
				</header>

				{/* ── Content ──────────────────────────────────────────────────── */}
				<Layout
					vault={vault}
					view={view}
					sidebarOpen={sidebarOpen}
					onSidebarClose={() => setSidebarOpen(false)}
					rightSidebarOpen={rightSidebarOpen}
					onRightPanelClose={() => setRightSidebarOpen(false)}
					isDark={dark}
					activeNoteId={activeNoteId}
					onNoteSelect={(noteId, anchor) => {
						setActiveNoteId(noteId);
						setView("notes");
						pushHistory(noteId, anchor);
						// Push a real browser history entry so the browser's own back button works
						history.pushState(null, "", `#${noteId}`);
						return anchor;
					}}
					activeTag={activeTag}
					onTagChange={setActiveTag}
					sidebarTab={sidebarTab}
					onSidebarTabChange={setSidebarTab}
					onTagClick={handleTagClick}
				/>
			</div>

			<SearchDialog
				open={searchOpen}
				onOpenChange={setSearchOpen}
				vault={vault}
				onSelectNote={(note) => {
					setActiveNoteId(note.id);
					setView("notes");
					pushHistory(note.id);
					setSearchOpen(false);
				}}
			/>
		</TooltipProvider>
	);
}
