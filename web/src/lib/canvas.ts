import type { CanvasEdge, CanvasNode } from "@/types";

export type Side = "top" | "right" | "bottom" | "left";

// Obsidian's six preset colors. A node/edge color is either one of these
// preset digits or a raw hex string, which we pass through unchanged.
const PRESET_COLORS: Record<string, string> = {
	"1": "#e93147", // red
	"2": "#ec7500", // orange
	"3": "#e0ac00", // yellow
	"4": "#08b94e", // green
	"5": "#00bfbc", // cyan
	"6": "#9259e0", // purple
};

// Resolve a canvas color value to a CSS color, or undefined when unset.
export function canvasColor(color?: string): string | undefined {
	if (!color) return undefined;
	return PRESET_COLORS[color] ?? color;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

// Axis-aligned bounding box covering every node. Falls back to a unit box for
// an empty canvas so callers never divide by zero when fitting.
export function nodeBounds(nodes: CanvasNode[]): Bounds {
	if (nodes.length === 0) {
		return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const n of nodes) {
		minX = Math.min(minX, n.x);
		minY = Math.min(minY, n.y);
		maxX = Math.max(maxX, n.x + n.width);
		maxY = Math.max(maxY, n.y + n.height);
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// The point on a rect's edge for the given side.
export function sidePoint(rect: Rect, side: Side): { x: number; y: number } {
	switch (side) {
		case "top":
			return { x: rect.x + rect.width / 2, y: rect.y };
		case "bottom":
			return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
		case "left":
			return { x: rect.x, y: rect.y + rect.height / 2 };
		case "right":
			return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
	}
}

// When an edge omits a side, pick the one facing the other node based on the
// dominant axis between the two rect centers.
export function inferSide(from: Rect, to: Rect): Side {
	const fcx = from.x + from.width / 2;
	const fcy = from.y + from.height / 2;
	const tcx = to.x + to.width / 2;
	const tcy = to.y + to.height / 2;
	const dx = tcx - fcx;
	const dy = tcy - fcy;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0 ? "right" : "left";
	}
	return dy >= 0 ? "bottom" : "top";
}

const SIDE_NORMAL: Record<Side, { x: number; y: number }> = {
	top: { x: 0, y: -1 },
	bottom: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

export interface EdgeGeometry {
	sx: number;
	sy: number;
	ex: number;
	ey: number;
	fromSide: Side;
	toSide: Side;
	path: string; // SVG cubic bezier
}

// Compute the start/end points and a smooth cubic-bezier path for an edge,
// curving out along each side's normal the way Obsidian draws them.
export function edgeGeometry(
	edge: CanvasEdge,
	from: Rect,
	to: Rect,
): EdgeGeometry {
	const fromSide = edge.fromSide ?? inferSide(from, to);
	const toSide = edge.toSide ?? inferSide(to, from);
	const s = sidePoint(from, fromSide);
	const e = sidePoint(to, toSide);

	const dist = Math.hypot(e.x - s.x, e.y - s.y);
	const curve = Math.min(Math.max(dist / 2, 30), 150);
	const fn = SIDE_NORMAL[fromSide];
	const tn = SIDE_NORMAL[toSide];
	const c1x = s.x + fn.x * curve;
	const c1y = s.y + fn.y * curve;
	const c2x = e.x + tn.x * curve;
	const c2y = e.y + tn.y * curve;

	return {
		sx: s.x,
		sy: s.y,
		ex: e.x,
		ey: e.y,
		fromSide,
		toSide,
		path: `M ${s.x} ${s.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${e.x} ${e.y}`,
	};
}

// The rotation (degrees) for an arrowhead sitting at a node's side, pointing
// into the node.
export function arrowRotation(side: Side): number {
	switch (side) {
		case "top":
			return 180;
		case "bottom":
			return 0;
		case "left":
			return 90;
		case "right":
			return -90;
	}
}
