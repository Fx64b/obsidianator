import { useState, useEffect, useRef } from "react";
import { ChevronRight, Hash, FileText, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Note, VaultData, Folder } from "@/types";

interface SidebarProps {
	vault: VaultData;
	selectedNote: Note | null;
	onSelectNote: (note: Note) => void;
	tab: "files" | "tags";
	onTabChange: (tab: "files" | "tags") => void;
	activeTag: string | null;
	onTagChange: (tag: string | null) => void;
}

function folderContainsNote(
	folder: Folder,
	noteId: string,
	folders: Folder[],
): boolean {
	if (folder.notes.includes(noteId)) return true;
	for (const childPath of folder.children) {
		const child = folders.find((f) => f.path === childPath);
		if (child && folderContainsNote(child, noteId, folders)) return true;
	}
	return false;
}

function NoteItem({
	note,
	selected,
	onSelect,
	indent = 0,
}: {
	note: Note;
	selected: boolean;
	onSelect: () => void;
	indent?: number;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (selected)
			ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [selected]);

	return (
		<button
			type="button"
			ref={ref}
			onClick={onSelect}
			style={{ paddingLeft: `${0.5 + indent * 0.75}rem` }}
			className={cn(
				"w-full flex items-center gap-1.5 rounded-md py-1 pr-3 text-left text-xs transition-colors",
				selected
					? "bg-accent text-foreground font-medium"
					: "text-muted-foreground hover:text-foreground hover:bg-accent/60",
			)}
		>
			<FileText className="h-3 w-3 shrink-0 opacity-60" />
			<span className="truncate">{note.title}</span>
		</button>
	);
}

function FolderNode({
	folder,
	vault,
	selectedNote,
	onSelectNote,
	depth = 0,
}: {
	folder: Folder;
	vault: VaultData;
	selectedNote: Note | null;
	onSelectNote: (note: Note) => void;
	depth?: number;
}) {
	const [open, setOpen] = useState(true);

	// Auto-expand when selected note is inside this folder or its descendants
	useEffect(() => {
		if (
			selectedNote &&
			folderContainsNote(folder, selectedNote.id, vault.folders)
		) {
			setOpen(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedNote?.id, vault.folders, selectedNote, folder]);

	const notes = folder.notes
		.map((id) => vault.notes.find((n) => n.id === id))
		.filter((n): n is Note => n !== undefined)
		.sort((a, b) => a.title.localeCompare(b.title));

	const subFolders = folder.children
		.map((path) => vault.folders.find((f) => f.path === path))
		.filter((f): f is Folder => f !== undefined)
		.sort((a, b) => a.name.localeCompare(b.name));

	if (notes.length === 0 && subFolders.length === 0) return null;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger
				style={{ paddingLeft: `${0.375 + depth * 0.75}rem` }}
				className="flex w-full items-center gap-1 py-1 pr-3 text-left text-xs font-medium text-muted-foreground/70 hover:text-muted-foreground rounded-md transition-colors"
			>
				<ChevronRight
					className={cn(
						"h-3 w-3 shrink-0 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<span className="truncate">{folder.name}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-px space-y-px">
					{/* Folders first, then notes — mirrors Obsidian default */}
					{subFolders.map((sub) => (
						<FolderNode
							key={sub.path}
							folder={sub}
							vault={vault}
							selectedNote={selectedNote}
							onSelectNote={onSelectNote}
							depth={depth + 1}
						/>
					))}
					{notes.map((note) => (
						<NoteItem
							key={note.id}
							note={note}
							selected={selectedNote?.id === note.id}
							onSelect={() => onSelectNote(note)}
							indent={depth + 1}
						/>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export function Sidebar({
	vault,
	selectedNote,
	onSelectNote,
	tab,
	onTabChange,
	activeTag,
	onTagChange,
}: SidebarProps) {
	const [filter, setFilter] = useState("");
	const [tagFilter, setTagFilter] = useState("");
	const filterRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (tab !== "files") setFilter("");
	}, [tab]);
	useEffect(() => {
		if (tab !== "tags") setTagFilter("");
	}, [tab]);

	// Scroll to the active tag when it changes or when switching to the tags tab
	useEffect(() => {
		if (tab !== "tags" || !activeTag) return;
		requestAnimationFrame(() => {
			document
				.querySelector<HTMLElement>(`[data-tag="${CSS.escape(activeTag)}"]`)
				?.scrollIntoView({ behavior: "smooth", block: "nearest" });
		});
	}, [activeTag, tab]);

	const rootNotes = vault.notes
		.filter((n) => !n.folder)
		.sort((a, b) => a.title.localeCompare(b.title));
	const rootFolders = vault.folders
		.filter((f) => !f.parent)
		.sort((a, b) => a.name.localeCompare(b.name));

	const tagCounts = new Map<string, number>();
	for (const note of vault.notes) {
		for (const tag of note.tags) {
			tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
		}
	}
	const sortedTags = [...tagCounts.entries()].sort(([, a], [, b]) => b - a);
	const tagNotes = (tag: string) =>
		vault.notes
			.filter((n) => n.tags.includes(tag))
			.sort((a, b) => a.title.localeCompare(b.title));

	const lf = filter.toLowerCase();
	const filteredNotes = filter.trim()
		? vault.notes
				.filter((n) => n.title.toLowerCase().includes(lf))
				.sort((a, b) => a.title.localeCompare(b.title))
		: null;

	const ltf = tagFilter.toLowerCase();
	const filteredTags = tagFilter.trim()
		? sortedTags.filter(([tag]) => tag.toLowerCase().includes(ltf))
		: sortedTags;

	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			{/* Tab bar */}
			<div className="flex shrink-0 border-b border-sidebar-border">
				{(["files", "tags"] as const).map((t) => (
					<button
						type="button"
						key={t}
						onClick={() => onTabChange(t)}
						className={cn(
							"flex-1 py-2 text-[11px] font-medium capitalize transition-colors",
							tab === t
								? "text-foreground border-b-2 border-foreground -mb-px"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{t}
					</button>
				))}
			</div>

			{/* Filter input — files tab */}
			{tab === "files" && (
				<div className="shrink-0 px-2 py-1.5 border-b border-sidebar-border">
					<div className="flex items-center gap-1.5 rounded-md bg-sidebar-accent/40 px-2 py-1">
						<Search className="h-3 w-3 shrink-0 text-muted-foreground/60" />
						<input
							ref={filterRef}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Filter notes…"
							className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 text-foreground"
						/>
						{filter && (
							<button
								type="button"
								onClick={() => {
									setFilter("");
									filterRef.current?.focus();
								}}
								className="text-muted-foreground/60 hover:text-foreground"
							>
								<X className="h-3 w-3" />
							</button>
						)}
					</div>
				</div>
			)}

			{/* Filter input — tags tab */}
			{tab === "tags" && (
				<div className="shrink-0 px-2 py-1.5 border-b border-sidebar-border">
					<div className="flex items-center gap-1.5 rounded-md bg-sidebar-accent/40 px-2 py-1">
						<Search className="h-3 w-3 shrink-0 text-muted-foreground/60" />
						<input
							ref={filterRef}
							value={tagFilter}
							onChange={(e) => setTagFilter(e.target.value)}
							placeholder="Filter tags…"
							className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 text-foreground"
						/>
						{tagFilter && (
							<button
								type="button"
								onClick={() => {
									setTagFilter("");
									filterRef.current?.focus();
								}}
								className="text-muted-foreground/60 hover:text-foreground"
							>
								<X className="h-3 w-3" />
							</button>
						)}
					</div>
				</div>
			)}

			<ScrollArea className="flex-1 min-h-0">
				{tab === "files" ? (
					filteredNotes ? (
						<div className="px-2 py-3 space-y-px">
							{filteredNotes.length === 0 ? (
								<p className="px-2 text-xs text-muted-foreground italic">
									No matches
								</p>
							) : (
								filteredNotes.map((note) => (
									<button
										type="button"
										key={note.id}
										onClick={() => {
											onSelectNote(note);
											setFilter("");
										}}
										className={cn(
											"w-full flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
											selectedNote?.id === note.id
												? "bg-accent text-foreground font-medium"
												: "text-muted-foreground hover:text-foreground hover:bg-accent/60",
										)}
									>
										<span className="flex items-center gap-1.5 text-xs w-full">
											<FileText className="h-3 w-3 shrink-0 opacity-60" />
											<span className="truncate">{note.title}</span>
										</span>
										{note.folder && (
											<span className="pl-[18px] text-[10px] text-muted-foreground/60 truncate w-full">
												{note.folder}
											</span>
										)}
									</button>
								))
							)}
						</div>
					) : (
						<div className="px-2 py-3 space-y-px">
							{/* Folders first, then notes — mirrors Obsidian default */}
							{rootFolders.map((folder) => (
								<FolderNode
									key={folder.path}
									folder={folder}
									vault={vault}
									selectedNote={selectedNote}
									onSelectNote={onSelectNote}
								/>
							))}
							{rootFolders.length > 0 && rootNotes.length > 0 && (
								<div className="h-2" />
							)}
							{rootNotes.map((note) => (
								<NoteItem
									key={note.id}
									note={note}
									selected={selectedNote?.id === note.id}
									onSelect={() => onSelectNote(note)}
								/>
							))}
						</div>
					)
				) : (
					<div className="px-2 py-3 space-y-px">
						{filteredTags.length === 0 ? (
							<p className="px-2 text-xs text-muted-foreground italic">
								No tags
							</p>
						) : (
							filteredTags.map(([tag, count]) => {
								const isActive = activeTag === tag;
								const notes = isActive ? tagNotes(tag) : [];
								return (
									<div key={tag}>
										<button
											type="button"
											data-tag={tag}
											onClick={() => onTagChange(isActive ? null : tag)}
											className={cn(
												"flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors",
												isActive
													? "bg-accent text-foreground font-medium"
													: "text-muted-foreground hover:text-foreground hover:bg-accent/60",
											)}
										>
											<Hash className="h-2.5 w-2.5 shrink-0" />
											<span className="flex-1 truncate">{tag}</span>
											<span className="text-[10px] opacity-50">{count}</span>
										</button>
										{isActive && notes.length > 0 && (
											<div className="mt-px mb-1 space-y-px">
												{notes.map((note) => (
													<NoteItem
														key={note.id}
														note={note}
														selected={selectedNote?.id === note.id}
														onSelect={() => onSelectNote(note)}
														indent={1}
													/>
												))}
											</div>
										)}
									</div>
								);
							})
						)}
					</div>
				)}
			</ScrollArea>

			{/* Footer */}
			<div className="border-t border-sidebar-border px-3 py-2">
				<p className="text-[11px] text-muted-foreground/50">
					{vault.notes.length} notes · {vault.tags.length} tags
				</p>
			</div>
		</div>
	);
}
