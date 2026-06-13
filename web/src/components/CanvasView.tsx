import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import {
	arrowRotation,
	type Bounds,
	canvasColor,
	edgeGeometry,
	nodeBounds,
	type Rect,
	type Side,
} from "@/lib/canvas";
import { useEnsureContent } from "@/hooks/useNoteContent";
import { preprocessContent } from "@/lib/markdown";
import { sanitizeSchema } from "@/lib/sanitizeSchema";
import { cn } from "@/lib/utils";
import type { Canvas, CanvasNode, VaultData } from "@/types";

const PAD = 120; // world padding so edge curves/arrows near the border aren't clipped
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp"];

interface CanvasViewProps {
	canvas: Canvas;
	vault: VaultData;
	onSelectNote: (noteId: string, anchor?: string) => void;
}

interface Transform {
	x: number;
	y: number;
	scale: number;
}

export function CanvasView({ canvas, vault, onSelectNote }: CanvasViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [transform, setTransform] = useState<Transform>({
		x: 0,
		y: 0,
		scale: 1,
	});
	const panState = useRef<{
		startX: number;
		startY: number;
		origX: number;
		origY: number;
	} | null>(null);
	const [panning, setPanning] = useState(false);

	// In chunked mode, fetch the content of every note referenced by a file
	// node so their excerpts render and clicking through opens instantly.
	const { ensure } = useEnsureContent();
	useEffect(() => {
		const ids = canvas.nodes
			.filter((n) => n.type === "file" && n.noteId)
			.map((n) => n.noteId as string);
		if (ids.length) ensure(ids);
	}, [canvas.nodes, ensure]);

	const bounds = useMemo<Bounds>(
		() => nodeBounds(canvas.nodes),
		[canvas.nodes],
	);
	const worldW = bounds.width + PAD * 2;
	const worldH = bounds.height + PAD * 2;

	// Shift canvas coords so the padded bounding box starts at (0,0); both the
	// node divs and the SVG edge layer use this same coordinate space.
	const toWorld = useCallback(
		(x: number, y: number) => ({
			x: x - bounds.minX + PAD,
			y: y - bounds.minY + PAD,
		}),
		[bounds.minX, bounds.minY],
	);

	const nodeRect = useCallback(
		(n: CanvasNode): Rect => {
			const p = toWorld(n.x, n.y);
			return { x: p.x, y: p.y, width: n.width, height: n.height };
		},
		[toWorld],
	);

	// Fit the whole canvas into the viewport on mount and whenever the canvas
	// changes.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const cw = el.clientWidth;
		const ch = el.clientHeight;
		if (cw === 0 || ch === 0) return;
		const scale = Math.min(cw / worldW, ch / worldH, 1.5) * 0.9;
		setTransform({
			scale,
			x: (cw - worldW * scale) / 2,
			y: (ch - worldH * scale) / 2,
		});
	}, [worldW, worldH]);

	const onPointerDown = (e: React.PointerEvent) => {
		// Only start a pan from the background, not from interactive node content.
		if ((e.target as HTMLElement).closest("[data-canvas-node]")) return;
		panState.current = {
			startX: e.clientX,
			startY: e.clientY,
			origX: transform.x,
			origY: transform.y,
		};
		setPanning(true);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const p = panState.current;
		if (!p) return;
		setTransform((t) => ({
			...t,
			x: p.origX + (e.clientX - p.startX),
			y: p.origY + (e.clientY - p.startY),
		}));
	};

	const endPan = () => {
		panState.current = null;
		setPanning(false);
	};

	const onWheel = (e: React.WheelEvent) => {
		const el = containerRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		setTransform((t) => {
			const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
			const scale = Math.min(Math.max(t.scale * factor, 0.1), 4);
			// Keep the point under the cursor stationary while zooming.
			return {
				scale,
				x: px - ((px - t.x) / t.scale) * scale,
				y: py - ((py - t.y) / t.scale) * scale,
			};
		});
	};

	// Groups render behind everything else.
	const groups = canvas.nodes.filter((n) => n.type === "group");
	const items = canvas.nodes.filter((n) => n.type !== "group");
	const nodeById = useMemo(() => {
		const m = new Map<string, CanvasNode>();
		for (const n of canvas.nodes) m.set(n.id, n);
		return m;
	}, [canvas.nodes]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative h-full w-full overflow-hidden bg-muted/30",
				panning ? "cursor-grabbing" : "cursor-grab",
			)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endPan}
			onPointerLeave={endPan}
			onWheel={onWheel}
		>
			<div
				className="absolute left-0 top-0 origin-top-left"
				style={{
					width: worldW,
					height: worldH,
					transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
				}}
			>
				{/* Groups (behind) */}
				{groups.map((g) => {
					const r = nodeRect(g);
					const color = canvasColor(g.color) ?? "var(--muted-foreground)";
					return (
						<div
							key={g.id}
							className="absolute rounded-lg border-2"
							style={{
								left: r.x,
								top: r.y,
								width: r.width,
								height: r.height,
								borderColor: color,
								backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)`,
							}}
						>
							{g.label && (
								<span
									className="absolute -top-6 left-0 rounded px-1.5 py-0.5 text-xs font-medium text-white"
									style={{ backgroundColor: color }}
								>
									{g.label}
								</span>
							)}
						</div>
					);
				})}

				{/* Edges */}
				<svg
					className="pointer-events-none absolute left-0 top-0 overflow-visible"
					width={worldW}
					height={worldH}
					aria-hidden="true"
				>
					{canvas.edges.map((edge) => {
						const from = nodeById.get(edge.fromNode);
						const to = nodeById.get(edge.toNode);
						if (!from || !to) return null;
						const geo = edgeGeometry(edge, nodeRect(from), nodeRect(to));
						const stroke = canvasColor(edge.color) ?? "var(--muted-foreground)";
						const showToArrow = edge.toEnd !== "none";
						const showFromArrow = edge.fromEnd === "arrow";
						return (
							<g key={edge.id}>
								<path
									d={geo.path}
									fill="none"
									stroke={stroke}
									strokeWidth={2}
									strokeLinecap="round"
								/>
								{showToArrow && (
									<Arrowhead
										x={geo.ex}
										y={geo.ey}
										side={geo.toSide}
										fill={stroke}
									/>
								)}
								{showFromArrow && (
									<Arrowhead
										x={geo.sx}
										y={geo.sy}
										side={geo.fromSide}
										fill={stroke}
									/>
								)}
								{edge.label && (
									<EdgeLabel
										x={(geo.sx + geo.ex) / 2}
										y={(geo.sy + geo.ey) / 2}
										text={edge.label}
									/>
								)}
							</g>
						);
					})}
				</svg>

				{/* Nodes (front) */}
				{items.map((n) => {
					const r = nodeRect(n);
					const color = canvasColor(n.color);
					return (
						<div
							key={n.id}
							data-canvas-node
							className="absolute overflow-hidden rounded-lg border bg-card shadow-sm"
							style={{
								left: r.x,
								top: r.y,
								width: r.width,
								height: r.height,
								borderColor: color,
								borderTopWidth: color ? 3 : undefined,
							}}
						>
							<CanvasNodeBody
								node={n}
								vault={vault}
								onSelectNote={onSelectNote}
							/>
						</div>
					);
				})}
			</div>

			{/* Title overlay */}
			<div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/80 px-2.5 py-1 text-sm font-medium shadow-sm backdrop-blur">
				{canvas.name}
			</div>
		</div>
	);
}

function Arrowhead({
	x,
	y,
	side,
	fill,
}: {
	x: number;
	y: number;
	side: Side;
	fill: string;
}) {
	// Triangle whose tip sits on the connection point, pointing into the node.
	return (
		<polygon
			points="0,-7 5,3 -5,3"
			fill={fill}
			transform={`translate(${x} ${y}) rotate(${arrowRotation(side)})`}
		/>
	);
}

function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
	const w = Math.max(text.length * 6.5 + 12, 24);
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect
				x={-w / 2}
				y={-10}
				width={w}
				height={20}
				rx={4}
				fill="var(--background)"
				stroke="var(--border)"
			/>
			<text
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={11}
				fill="var(--foreground)"
			>
				{text}
			</text>
		</g>
	);
}

function CanvasNodeBody({
	node,
	vault,
	onSelectNote,
}: {
	node: CanvasNode;
	vault: VaultData;
	onSelectNote: (noteId: string, anchor?: string) => void;
}) {
	if (node.type === "text") {
		return (
			<CanvasTextNode
				text={node.text ?? ""}
				vault={vault}
				onSelectNote={onSelectNote}
			/>
		);
	}
	if (node.type === "link") {
		return <CanvasLinkNode url={node.url ?? ""} />;
	}
	if (node.type === "file") {
		return (
			<CanvasFileNode node={node} vault={vault} onSelectNote={onSelectNote} />
		);
	}
	return null;
}

function CanvasTextNode({
	text,
	vault,
	onSelectNote,
}: {
	text: string;
	vault: VaultData;
	onSelectNote: (noteId: string, anchor?: string) => void;
}) {
	const processed = useMemo(
		() => preprocessContent(text, vault),
		[text, vault],
	);
	return (
		<div className="markdown-body h-full overflow-auto p-3 text-sm">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
				urlTransform={(u) => u}
				components={{
					a({ href, children }) {
						if (href?.startsWith("wiki:")) {
							const [noteId, anchor] = href.slice(5).split("#");
							return (
								<button
									type="button"
									className="wikilink cursor-pointer"
									onClick={() =>
										onSelectNote(noteId, anchor ? `#${anchor}` : undefined)
									}
								>
									{children}
								</button>
							);
						}
						if (href?.startsWith("wiki-missing:")) {
							return <span className="wikilink-missing">{children}</span>;
						}
						return (
							<a href={href} target="_blank" rel="noopener noreferrer">
								{children}
							</a>
						);
					},
				}}
			>
				{processed}
			</ReactMarkdown>
		</div>
	);
}

function CanvasLinkNode({ url }: { url: string }) {
	let host = url;
	try {
		host = new URL(url).host;
	} catch {
		// keep raw url as label
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="flex h-full flex-col gap-1 p-3 no-underline"
		>
			<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Link2 className="h-3.5 w-3.5 shrink-0" />
				{host}
			</span>
			<span className="truncate text-sm text-primary">{url}</span>
			<ExternalLink className="mt-auto h-3.5 w-3.5 self-end text-muted-foreground" />
		</a>
	);
}

function CanvasFileNode({
	node,
	vault,
	onSelectNote,
}: {
	node: CanvasNode;
	vault: VaultData;
	onSelectNote: (noteId: string, anchor?: string) => void;
}) {
	const file = node.file ?? "";
	const base = file.split("/").pop() ?? file;
	const ext = base.split(".").pop()?.toLowerCase() ?? "";

	if (node.noteId) {
		const note = vault.notes.find((n) => n.id === node.noteId);
		return (
			<button
				type="button"
				onClick={() => node.noteId && onSelectNote(node.noteId)}
				className="flex h-full w-full flex-col gap-1.5 p-3 text-left hover:bg-accent/50"
			>
				<span className="flex items-center gap-1.5 text-sm font-medium">
					<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
					{note?.title ?? base}
				</span>
				{note?.plainText && (
					<span className="line-clamp-3 text-xs text-muted-foreground">
						{note.plainText}
					</span>
				)}
			</button>
		);
	}

	if (IMAGE_EXTS.includes(ext)) {
		const src = vault.attachments[base.toLowerCase()];
		if (src) {
			return (
				<img
					src={`./files/${src}`}
					alt={base}
					className="h-full w-full object-contain"
					loading="lazy"
				/>
			);
		}
	}

	return (
		<div className="flex h-full flex-col items-center justify-center gap-1.5 p-3 text-center text-xs text-muted-foreground">
			<FileText className="h-5 w-5" />
			{base}
		</div>
	);
}
