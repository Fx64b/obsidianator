import { useState, useCallback, useEffect, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MarkdownView } from "@/components/MarkdownView";
import { GraphView } from "@/components/GraphView";
import { CanvasView } from "@/components/CanvasView";
import { RightPanel } from "@/components/RightPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useMobile } from "@/hooks/useMobile";
import { useEnsureContent } from "@/hooks/useNoteContent";
import { cn } from "@/lib/utils";
import type { Canvas, VaultData, Note } from "@/types";

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 480;

function ResizeHandle({
	side,
	onDelta,
}: {
	side: "left" | "right";
	onDelta: (delta: number) => void;
}) {
	const [dragging, setDragging] = useState(false);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);
			let lastX = e.clientX;

			const onMove = (ev: MouseEvent) => {
				const delta = side === "left" ? ev.clientX - lastX : lastX - ev.clientX;
				lastX = ev.clientX;
				onDelta(delta);
			};
			const onUp = () => {
				setDragging(false);
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[side, onDelta],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: resize handle requires mousedown, keyboard resize not implemented
		<div
			onMouseDown={handleMouseDown}
			className={cn(
				"relative w-1 shrink-0 cursor-col-resize group z-10",
				side === "left" ? "border-r border-border" : "border-l border-border",
			)}
		>
			<div
				className={cn(
					"absolute inset-y-0 -inset-x-1 transition-colors",
					dragging ? "bg-foreground/10" : "group-hover:bg-foreground/5",
				)}
			/>
		</div>
	);
}

interface LayoutProps {
	vault: VaultData;
	view: "notes" | "graph" | "canvas";
	sidebarOpen: boolean;
	onSidebarClose: () => void;
	rightSidebarOpen: boolean;
	onRightPanelClose: () => void;
	isDark: boolean;
	activeNoteId: string | null;
	onNoteSelect: (noteId: string, anchor?: string) => void;
	activeCanvasId: string | null;
	onCanvasSelect: (canvas: Canvas) => void;
	activeTag: string | null;
	onTagChange: (tag: string | null) => void;
	sidebarTab: "files" | "tags";
	onSidebarTabChange: (tab: "files" | "tags") => void;
	onTagClick: (tag: string) => void;
}

export function Layout({
	vault,
	view,
	sidebarOpen,
	onSidebarClose,
	rightSidebarOpen,
	onRightPanelClose,
	isDark,
	activeNoteId,
	onNoteSelect,
	activeCanvasId,
	onCanvasSelect,
	activeTag,
	onTagChange,
	sidebarTab,
	onSidebarTabChange,
	onTagClick,
}: LayoutProps) {
	const [activeHeadingId, setActiveHeadingId] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const [leftWidth, setLeftWidth] = useLocalStorage("sidebar-left-width", 224);
	const [rightWidth, setRightWidth] = useLocalStorage(
		"sidebar-right-width",
		224,
	);
	const isMobile = useMobile();
	const { ready } = useEnsureContent();

	const activeNote: Note | null =
		(activeNoteId ? vault.notes.find((n) => n.id === activeNoteId) : null) ??
		vault.notes[0] ??
		null;

	const activeCanvas: Canvas | null = activeCanvasId
		? (vault.canvases.find((c) => c.id === activeCanvasId) ?? null)
		: null;

	// The right panel (TOC, backlinks, mini-graph) is note-specific; suppress it
	// while a canvas fills the main area so it doesn't show a stale note.
	const panelNote = view === "canvas" ? null : activeNote;

	// Scroll-spy
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => {
			const headings = Array.from(
				el.querySelectorAll<HTMLElement>(
					"h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]",
				),
			);
			if (!headings.length) return;
			let active = headings[0].id;
			for (const h of headings) {
				if (h.getBoundingClientRect().top <= 80) active = h.id;
			}
			setActiveHeadingId(active);
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	const handleNoteSelect = useCallback(
		(noteId: string, anchor?: string) => {
			onNoteSelect(noteId, anchor);
			setActiveHeadingId("");
			if (isMobile) onSidebarClose();
			if (anchor) {
				const slug = anchor.replace(/^#/, "");
				const container = scrollRef.current;
				if (!container) return;
				// Wait for the heading element to appear in the DOM (renders async),
				// then scroll to it. Give up after 2 seconds.
				const tryScroll = () => {
					const el = container.querySelector<HTMLElement>(`[id="${slug}"]`);
					if (el) {
						el.scrollIntoView({ behavior: "smooth", block: "start" });
						return true;
					}
					return false;
				};
				if (!tryScroll()) {
					const deadline = Date.now() + 2000;
					const obs = new MutationObserver(() => {
						if (tryScroll() || Date.now() > deadline) obs.disconnect();
					});
					obs.observe(container, { childList: true, subtree: true });
				}
			} else {
				requestAnimationFrame(() => {
					if (scrollRef.current) scrollRef.current.scrollTop = 0;
				});
			}
		},
		[onNoteSelect, onSidebarClose, isMobile],
	);

	const handleLeftDelta = useCallback(
		(delta: number) => {
			setLeftWidth((w) =>
				Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, w + delta)),
			);
		},
		[setLeftWidth],
	);

	const handleRightDelta = useCallback(
		(delta: number) => {
			setRightWidth((w) =>
				Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, w + delta)),
			);
		},
		[setRightWidth],
	);

	return (
		<div className="flex flex-1 min-h-0 relative">
			{/* Left sidebar — overlay on mobile, static on desktop */}
			{sidebarOpen && isMobile && (
				<button
					type="button"
					aria-label="Close sidebar"
					className="fixed inset-0 z-40 bg-black/40 border-0 p-0 cursor-default"
					onClick={onSidebarClose}
				/>
			)}
			{sidebarOpen && (
				<>
					<aside
						className={cn(
							isMobile
								? "fixed inset-y-0 left-0 z-50 w-72 shadow-xl"
								: "shrink-0 min-h-0",
						)}
						style={isMobile ? undefined : { width: leftWidth }}
					>
						<Sidebar
							vault={vault}
							selectedNote={view === "canvas" ? null : activeNote}
							onSelectNote={(note) => handleNoteSelect(note.id)}
							tab={sidebarTab}
							onTabChange={onSidebarTabChange}
							activeTag={activeTag}
							onTagChange={onTagChange}
							activeCanvasId={view === "canvas" ? activeCanvasId : null}
							onSelectCanvas={(canvas) => {
								onCanvasSelect(canvas);
								if (isMobile) onSidebarClose();
							}}
						/>
					</aside>
					{!isMobile && <ResizeHandle side="left" onDelta={handleLeftDelta} />}
				</>
			)}

			{/* Main */}
			<main className="flex-1 min-w-0 h-full overflow-hidden">
				{view === "canvas" && activeCanvas ? (
					<CanvasView
						canvas={activeCanvas}
						vault={vault}
						onSelectNote={handleNoteSelect}
					/>
				) : view === "graph" ? (
					<GraphView
						vault={vault}
						selectedNote={activeNote}
						onSelectNote={(note) => handleNoteSelect(note.id)}
						isDark={isDark}
					/>
				) : activeNote ? (
					<ScrollArea
						className="h-full [&>[data-slot=scroll-area-viewport]>div]:!block [&>[data-slot=scroll-area-viewport]>div]:!min-w-0"
						viewportRef={scrollRef}
					>
						{ready(activeNote.id) ? (
							<MarkdownView
								note={activeNote}
								vault={vault}
								onSelectNote={handleNoteSelect}
								onTagClick={onTagClick}
							/>
						) : (
							<div className="flex h-full items-center justify-center py-20">
								<div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
							</div>
						)}
					</ScrollArea>
				) : (
					<div className="flex h-full items-center justify-center">
						<p className="text-sm text-muted-foreground">
							Select a note to begin
						</p>
					</div>
				)}
			</main>

			{/* Right panel — bottom sheet on mobile, sidebar on desktop */}
			{rightSidebarOpen && isMobile && (
				<>
					<button
						type="button"
						aria-label="Close panel"
						className="fixed inset-0 z-40 bg-black/40 border-0 p-0 cursor-default"
						onClick={onRightPanelClose}
					/>
					{/* Drag handle plus a fixed-height ScrollArea. The scroll region needs
					    a *definite* height: Radix's viewport is height:100%, which can't
					    resolve against a max-height-only parent, so the content would
					    overflow the sheet and never scroll. */}
					<div className="fixed bottom-0 left-0 right-0 z-50 overflow-hidden rounded-t-xl border-t border-border bg-background shadow-xl">
						<div className="flex justify-center py-2.5">
							<div className="h-1 w-10 rounded-full bg-border" />
						</div>
						<RightPanel
							vault={vault}
							note={panelNote}
							activeHeadingId={activeHeadingId}
							onSelectNote={(noteId, anchor) => {
								handleNoteSelect(noteId, anchor);
								onRightPanelClose();
							}}
							isDark={isDark}
							scrollClassName="h-[70vh]"
						/>
					</div>
				</>
			)}
			{rightSidebarOpen && !isMobile && (
				<>
					<ResizeHandle side="right" onDelta={handleRightDelta} />
					<aside style={{ width: rightWidth }} className="shrink-0 min-h-0">
						<RightPanel
							vault={vault}
							note={panelNote}
							activeHeadingId={activeHeadingId}
							onSelectNote={handleNoteSelect}
							isDark={isDark}
						/>
					</aside>
				</>
			)}
		</div>
	);
}
