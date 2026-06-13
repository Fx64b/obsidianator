import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MiniGraph } from "@/components/MiniGraph";
import { FrontmatterPanel } from "@/components/FrontmatterPanel";
import { WikilinkPreview } from "@/components/WikilinkPreview";
import type { Note, VaultData } from "@/types";

function PanelSection({
	title,
	defaultOpen = true,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="border-b border-border"
		>
			<CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors">
				<span>{title}</span>
				{open ? (
					<ChevronDown className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>{children}</CollapsibleContent>
		</Collapsible>
	);
}

interface RightPanelProps {
	vault: VaultData;
	note: Note | null;
	activeHeadingId: string;
	onSelectNote: (noteId: string, anchor?: string) => void;
	isDark: boolean;
	// Height class for the scroll container. Defaults to "h-full" (desktop
	// sidebar, which has a definite height). The mobile bottom sheet passes a
	// max-height instead, because a percentage height can't resolve there.
	scrollClassName?: string;
}

export function RightPanel({
	vault,
	note,
	activeHeadingId,
	onSelectNote,
	isDark,
	scrollClassName = "h-full",
}: RightPanelProps) {
	const backlinks = note
		? (note.backlinks
				.map((id) => vault.notes.find((n) => n.id === id))
				.filter(Boolean) as Note[])
		: [];

	if (!note) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-xs text-muted-foreground">No note selected</p>
			</div>
		);
	}

	return (
		<ScrollArea className={scrollClassName}>
			<div>
				{/* Contents / TOC */}
				<PanelSection title="Contents">
					{note.headers.length === 0 ? (
						<p className="px-4 py-4 text-center text-xs text-muted-foreground italic">
							No headings
						</p>
					) : (
						<nav className="py-1 pb-2">
							{note.headers.map((h, i) => (
								<button
									type="button"
									key={i}
									onClick={() => onSelectNote(note.id, `#${h.slug}`)}
									style={{ paddingLeft: `${(h.level - 1) * 10 + 12}px` }}
									className={cn(
										"block w-full py-1 pr-3 text-left text-xs leading-snug break-words transition-colors",
										activeHeadingId === h.slug
											? "font-medium text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{h.text}
								</button>
							))}
						</nav>
					)}
				</PanelSection>

				{/* Local Graph — fixed square */}
				<PanelSection title="Graph">
					<div className="p-2">
						<div className="aspect-square w-full overflow-hidden rounded-md">
							<MiniGraph
								vault={vault}
								note={note}
								onSelectNote={onSelectNote}
								isDark={isDark}
							/>
						</div>
					</div>
				</PanelSection>

				{/* Backlinks */}
				<PanelSection title="Backlinks">
					{backlinks.length === 0 ? (
						<p className="px-4 py-4 text-center text-xs text-muted-foreground italic">
							No backlinks
						</p>
					) : (
						<div className="py-1 pb-2">
							{backlinks.map((n) => (
								<WikilinkPreview key={n.id} noteId={n.id} vault={vault}>
									<button
										type="button"
										onClick={() => onSelectNote(n.id)}
										className="block w-full truncate px-4 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
									>
										{n.title}
									</button>
								</WikilinkPreview>
							))}
						</div>
					)}
				</PanelSection>

				{/* Properties — collapsed by default */}
				<PanelSection title="Properties" defaultOpen={false}>
					<FrontmatterPanel
						note={note}
						vault={vault}
						onSelectNote={(id) => onSelectNote(id)}
					/>
				</PanelSection>
			</div>
		</ScrollArea>
	);
}
