import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { Search, X, ChevronDown } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Note, VaultData } from "@/types";

interface GraphNode {
	id: string;
	title: string;
	tags: string[];
	folder: string;
	val: number;
	// Preserved positions across remounts
	x?: number;
	y?: number;
	vx?: number;
	vy?: number;
}

interface GraphLink {
	source: string;
	target: string;
}

interface GraphViewProps {
	vault: VaultData;
	selectedNote: Note | null;
	onSelectNote: (note: Note) => void;
	isDark?: boolean;
}

// Deterministic hue from a string (folder name / tag)
function stringToHue(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++)
		h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
	return Math.abs(h) % 360;
}

function hslColor(hue: number, dark: boolean): string {
	return dark ? `hsl(${hue},55%,62%)` : `hsl(${hue},55%,48%)`;
}

// Stable position cache so the simulation doesn't restart from scratch on remount
const positionCache = new Map<string, { x: number; y: number }>();

export function GraphView({
	vault,
	selectedNote,
	onSelectNote,
	isDark = false,
}: GraphViewProps) {
	const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
	const containerRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
	const [tagSearch, setTagSearch] = useState("");
	const [activeTag, setActiveTag] = useState<string | null>(null);
	const [tagsOpen, setTagsOpen] = useState(true);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				const { width, height } = entries[0].contentRect;
				setDimensions({ width, height });
			}, 60);
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
			clearTimeout(timerRef.current);
		};
	}, []);

	// Collect top-level folders for color coding
	const folderColors = useMemo(() => {
		const map = new Map<string, string>();
		for (const note of vault.notes) {
			const top = note.folder ? note.folder.split("/")[0] : "";
			if (top && !map.has(top))
				map.set(top, hslColor(stringToHue(top), isDark));
		}
		return map;
	}, [vault.notes, isDark]);

	// All tags in the vault, filtered by the tag search input
	const allTags = useMemo(() => {
		const set = new Set<string>();
		for (const n of vault.notes) for (const t of n.tags) set.add(t);
		return [...set].sort();
	}, [vault.notes]);

	const lq = tagSearch.toLowerCase();
	const filteredTags = useMemo(
		() => (lq ? allTags.filter((t) => t.toLowerCase().includes(lq)) : allTags),
		[allTags, lq],
	);

	// Clear active tag if it's been filtered out of the list
	useEffect(() => {
		if (activeTag && !allTags.includes(activeTag)) setActiveTag(null);
	}, [allTags, activeTag]);

	// Build graph data — restore cached positions for stable simulation
	const graphData = useMemo(() => {
		const visibleIds = new Set(
			vault.notes
				.filter((n) => !activeTag || n.tags.includes(activeTag))
				.map((n) => n.id),
		);

		const nodes: GraphNode[] = vault.notes
			.filter((n) => visibleIds.has(n.id))
			.map((n) => {
				const cached = positionCache.get(n.id);
				return {
					id: n.id,
					title: n.title,
					tags: n.tags,
					folder: n.folder,
					val: 1 + n.backlinks.length * 0.5,
					...(cached ?? {}),
				};
			});

		const links: GraphLink[] = vault.edges
			.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
			.map((e) => ({ source: e.source, target: e.target }));

		return { nodes, links };
	}, [vault.notes, vault.edges, activeTag]);

	// Save node positions to cache on each tick so remounts restore positions
	const onEngineTick = useCallback(() => {
		for (const node of graphData.nodes) {
			if (node.x != null && node.y != null) {
				positionCache.set(node.id, { x: node.x, y: node.y });
			}
		}
	}, [graphData.nodes]);

	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			const note = vault.notes.find((n) => n.id === node.id);
			if (note) onSelectNote(note);
		},
		[vault, onSelectNote],
	);

	const nodeColor = useCallback(
		(node: object) => {
			const n = node as GraphNode;
			if (selectedNote?.id === n.id) return isDark ? "#ffffff" : "#09090b";
			const top = n.folder ? n.folder.split("/")[0] : "";
			return folderColors.get(top) ?? (isDark ? "#52525b" : "#a1a1aa");
		},
		[selectedNote, isDark, folderColors],
	);

	const nodeLabel = useCallback(
		(node: object) => (node as GraphNode).title,
		[],
	);

	const uniqueFolders = useMemo(
		() => [...folderColors.entries()],
		[folderColors],
	);

	return (
		<TooltipProvider>
			<div ref={containerRef} className="w-full h-full relative bg-background">
				<ForceGraph2D
					ref={fgRef}
					graphData={graphData}
					width={dimensions.width}
					height={dimensions.height}
					nodeLabel={nodeLabel}
					nodeColor={nodeColor}
					nodeRelSize={5}
					linkColor={() => (isDark ? "#27272a" : "#e4e4e7")}
					linkWidth={1}
					onNodeClick={handleNodeClick as (node: object) => void}
					backgroundColor="transparent"
					onEngineTick={onEngineTick}
					nodeCanvasObject={(node, ctx, globalScale) => {
						const n = node as GraphNode & { x: number; y: number };
						const isSelected = selectedNote?.id === n.id;
						const r = (isSelected ? 6 : 4) + n.val;
						const top = n.folder ? n.folder.split("/")[0] : "";
						const fill = isSelected
							? isDark
								? "#ffffff"
								: "#09090b"
							: (folderColors.get(top) ?? (isDark ? "#52525b" : "#a1a1aa"));

						ctx.beginPath();
						ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
						ctx.fillStyle = fill;
						ctx.fill();

						if (isSelected) {
							ctx.strokeStyle = fill;
							ctx.lineWidth = 2;
							ctx.stroke();
						}

						if (globalScale >= 1.5 || isSelected) {
							const label = n.title;
							const fontSize = Math.max(8, 12 / globalScale);
							ctx.font = `${fontSize}px Inter, sans-serif`;
							ctx.fillStyle = isDark ? "#fafafa" : "#09090b";
							ctx.textAlign = "center";
							ctx.fillText(label, n.x, n.y + r + fontSize);
						}
					}}
				/>

				{/* Filter panel */}
				<div className="absolute top-3 left-3 flex flex-col gap-2 w-[220px]">
					{/* Tag search input */}
					<div className="flex items-center gap-1.5 rounded-md border border-border bg-background/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm">
						<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<input
							ref={searchRef}
							value={tagSearch}
							onChange={(e) => setTagSearch(e.target.value)}
							placeholder="Filter tags…"
							className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground text-foreground"
						/>
						{tagSearch && (
							<button
								type="button"
								onClick={() => {
									setTagSearch("");
									searchRef.current?.focus();
								}}
								className="text-muted-foreground hover:text-foreground"
							>
								<X className="h-3 w-3" />
							</button>
						)}
					</div>

					{/* Tag filter chips — collapsible, scrollable */}
					{allTags.length > 0 && (
						<div className="rounded-md border border-border bg-background/90 backdrop-blur-sm shadow-sm overflow-hidden">
							<button
								type="button"
								onClick={() => setTagsOpen((o) => !o)}
								className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
							>
								<span>
									Tags{" "}
									{activeTag && (
										<span className="text-foreground">· {activeTag}</span>
									)}
								</span>
								<ChevronDown
									className={cn(
										"h-3 w-3 transition-transform duration-150",
										tagsOpen && "rotate-180",
									)}
								/>
							</button>
							{tagsOpen && (
								<div className="h-48">
									<ScrollArea className="h-full">
										<div className="px-2 pb-2">
											{filteredTags.length === 0 ? (
												<p className="text-[10px] text-muted-foreground italic px-0.5">
													No matches
												</p>
											) : (
												<div className="flex flex-wrap gap-1">
													{filteredTags.map((tag) => (
														<button
															type="button"
															key={tag}
															onClick={() =>
																setActiveTag((t) => (t === tag ? null : tag))
															}
															className={cn(
																"rounded-full border px-2 py-0.5 text-[10px] transition-colors",
																activeTag === tag
																	? "border-foreground bg-foreground text-background"
																	: "border-border text-muted-foreground hover:text-foreground",
															)}
														>
															#{tag}
														</button>
													))}
												</div>
											)}
										</div>
									</ScrollArea>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Legend — folder colors */}
				<div className="absolute bottom-4 right-4 rounded-md border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm max-w-[200px]">
					<p className="mb-1.5">
						{graphData.nodes.length} / {vault.notes.length} notes ·{" "}
						{graphData.links.length} links
					</p>
					{uniqueFolders.length > 0 && (
						<div className="space-y-1">
							{uniqueFolders.map(([folder, color]) => (
								<div key={folder} className="flex items-center gap-1.5">
									<span
										className="h-2 w-2 rounded-full shrink-0"
										style={{ backgroundColor: color }}
									/>
									<span className="truncate text-[10px]">{folder}</span>
								</div>
							))}
						</div>
					)}
					<p className="mt-1.5 text-muted-foreground/60">
						Scroll · Drag · Click to open
					</p>
				</div>
			</div>
		</TooltipProvider>
	);
}
