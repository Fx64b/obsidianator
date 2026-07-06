import { describe, expect, it } from "vitest";
import {
	arrowRotation,
	canvasColor,
	edgeGeometry,
	inferSide,
	nodeBounds,
	type Rect,
	sidePoint,
} from "@/lib/canvas";
import type { CanvasEdge, CanvasNode } from "@/types";

function node(over: Partial<CanvasNode>): CanvasNode {
	return {
		id: "n",
		type: "text",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		...over,
	};
}

describe("canvasColor", () => {
	it("maps preset digits to hex", () => {
		expect(canvasColor("1")).toBe("#e93147");
		expect(canvasColor("6")).toBe("#9259e0");
	});
	it("passes hex strings through", () => {
		expect(canvasColor("#abcdef")).toBe("#abcdef");
	});
	it("returns undefined when unset", () => {
		expect(canvasColor(undefined)).toBeUndefined();
		expect(canvasColor("")).toBeUndefined();
	});
});

describe("nodeBounds", () => {
	it("covers all nodes", () => {
		const b = nodeBounds([
			node({ x: 0, y: 0, width: 100, height: 50 }),
			node({ x: 200, y: 100, width: 50, height: 50 }),
		]);
		expect(b).toMatchObject({ minX: 0, minY: 0, maxX: 250, maxY: 150 });
		expect(b.width).toBe(250);
		expect(b.height).toBe(150);
	});
	it("handles negative coordinates", () => {
		const b = nodeBounds([node({ x: -100, y: -50, width: 40, height: 40 })]);
		expect(b.minX).toBe(-100);
		expect(b.maxX).toBe(-60);
	});
	it("falls back to a unit box when empty", () => {
		expect(nodeBounds([])).toMatchObject({ width: 1, height: 1 });
	});
});

describe("sidePoint", () => {
	const r: Rect = { x: 10, y: 20, width: 100, height: 40 };
	it.each([
		["top", { x: 60, y: 20 }],
		["bottom", { x: 60, y: 60 }],
		["left", { x: 10, y: 40 }],
		["right", { x: 110, y: 40 }],
	] as const)("%s", (side, want) => {
		expect(sidePoint(r, side)).toEqual(want);
	});
});

describe("inferSide", () => {
	const from: Rect = { x: 0, y: 0, width: 100, height: 100 };
	it("picks right when target is to the right", () => {
		expect(inferSide(from, { x: 300, y: 0, width: 100, height: 100 })).toBe(
			"right",
		);
	});
	it("picks bottom when target is below", () => {
		expect(inferSide(from, { x: 0, y: 300, width: 100, height: 100 })).toBe(
			"bottom",
		);
	});
	it("picks left when target is to the left", () => {
		expect(inferSide(from, { x: -300, y: 0, width: 100, height: 100 })).toBe(
			"left",
		);
	});
});

describe("edgeGeometry", () => {
	const from: Rect = { x: 0, y: 0, width: 100, height: 100 };
	const to: Rect = { x: 300, y: 0, width: 100, height: 100 };

	it("uses explicit sides when given", () => {
		const edge: CanvasEdge = {
			id: "e",
			fromNode: "a",
			toNode: "b",
			fromSide: "right",
			toSide: "left",
		};
		const g = edgeGeometry(edge, from, to);
		expect({ x: g.sx, y: g.sy }).toEqual({ x: 100, y: 50 });
		expect({ x: g.ex, y: g.ey }).toEqual({ x: 300, y: 50 });
		expect(g.path.startsWith("M 100 50 C")).toBe(true);
	});

	it("infers sides when omitted", () => {
		const edge: CanvasEdge = { id: "e", fromNode: "a", toNode: "b" };
		const g = edgeGeometry(edge, from, to);
		expect(g.fromSide).toBe("right");
		expect(g.toSide).toBe("left");
	});
});

describe("arrowRotation", () => {
	it.each([
		["top", 180],
		["bottom", 0],
		["left", 90],
		["right", -90],
	] as const)("%s → %s", (side, deg) => {
		expect(arrowRotation(side)).toBe(deg);
	});
});
