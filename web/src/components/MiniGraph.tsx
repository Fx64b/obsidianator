import { useCallback, useRef, useEffect, useState, memo, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { Note, VaultData } from "@/types";

interface MiniGraphProps {
	vault: VaultData;
	note: Note;
	onSelectNote: (noteId: string, anchor?: string) => void;
	isDark: boolean;
}

export const MiniGraph = memo(function MiniGraph({
	vault,
	note,
	onSelectNote,
	isDark,
}: MiniGraphProps) {
	const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
	const containerRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();
	const [dimensions, setDimensions] = useState({ width: 260, height: 260 });

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		// Debounce: only update dimensions after 60ms of resize inactivity so the
		// expensive ForceGraph canvas re-draw doesn't fire on every pixel of drag.
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

	// Memoize graph data so the force simulation doesn't restart on every parent render
	const graphData = useMemo(() => {
		const neighborIds = new Set<string>([
			note.id,
			...note.links,
			...note.backlinks,
		]);
		const nodes = vault.notes
			.filter((n) => neighborIds.has(n.id))
			.map((n) => ({
				id: n.id,
				title: n.title,
				val: 1 + (n.links.length + n.backlinks.length) * 0.5,
				isCenter: n.id === note.id,
			}));
		const links = vault.edges
			.filter((e) => neighborIds.has(e.source) && neighborIds.has(e.target))
			.map((e) => ({ source: e.source, target: e.target }));
		return { nodes, links };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [note.id, vault.notes, vault.edges, note.links, note.backlinks]);

	const nodeColor = useCallback(
		(node: object) => {
			const n = node as { id: string };
			if (n.id === note.id) return "#7c3aed";
			return isDark ? "#52525b" : "#a1a1aa";
		},
		[note.id, isDark],
	);

	const handleNodeClick = useCallback(
		(node: object) => {
			const n = node as { id: string };
			if (n.id !== note.id) onSelectNote(n.id);
		},
		[note.id, onSelectNote],
	);

	return (
		<div ref={containerRef} className="w-full h-full bg-background">
			<ForceGraph2D
				ref={fgRef}
				graphData={graphData}
				width={dimensions.width}
				height={dimensions.height}
				nodeLabel={(n: object) => (n as { title: string }).title}
				nodeColor={nodeColor}
				nodeRelSize={4}
				linkColor={() => (isDark ? "#27272a" : "#e4e4e7")}
				linkWidth={1}
				onNodeClick={handleNodeClick}
				backgroundColor="transparent"
				nodeCanvasObject={(node, ctx, globalScale) => {
					const n = node as {
						id: string;
						title: string;
						val: number;
						x: number;
						y: number;
					};
					const isCenter = n.id === note.id;
					const r = (isCenter ? 3.5 : 2) + n.val * 0.3;

					ctx.beginPath();
					ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
					ctx.fillStyle = isCenter ? "#7c3aed" : isDark ? "#52525b" : "#a1a1aa";
					ctx.fill();

					if (globalScale >= 2 || isCenter) {
						const fontSize = Math.max(5, 9 / globalScale);
						ctx.font = `${fontSize}px Inter, sans-serif`;
						ctx.fillStyle = isDark ? "#fafafa" : "#09090b";
						ctx.textAlign = "center";
						ctx.fillText(n.title, n.x, n.y + r + fontSize);
					}
				}}
			/>
		</div>
	);
});
