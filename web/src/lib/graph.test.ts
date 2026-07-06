import { describe, expect, it } from "vitest";
import {
	createdBounds,
	nodeGroup,
	orphanIdSet,
	visibleAtTime,
} from "@/lib/graph";
import { makeNote } from "@/test/fixture";

describe("nodeGroup", () => {
	it("folder mode uses the top-level folder", () => {
		expect(nodeGroup(makeNote({ folder: "Work/Notes" }), "folder")).toBe(
			"Work",
		);
		expect(nodeGroup(makeNote({ folder: "" }), "folder")).toBe("");
	});
	it("tag mode uses the first tag", () => {
		expect(nodeGroup(makeNote({ tags: ["a", "b"] }), "tag")).toBe("a");
		expect(nodeGroup(makeNote({ tags: [] }), "tag")).toBe("");
	});
});

describe("orphanIdSet", () => {
	it("returns notes with no edges", () => {
		const notes = [
			makeNote({ id: "a" }),
			makeNote({ id: "b" }),
			makeNote({ id: "c" }),
		];
		const edges = [{ source: "a", target: "b" }];
		const orphans = orphanIdSet(notes, edges);
		expect(orphans.has("c")).toBe(true);
		expect(orphans.has("a")).toBe(false);
		expect(orphans.has("b")).toBe(false);
	});
});

describe("createdBounds", () => {
	it("returns min/max of parseable dates", () => {
		const b = createdBounds([
			makeNote({ created: "2024-01-01T00:00:00Z" }),
			makeNote({ created: "2024-06-01T00:00:00Z" }),
			makeNote({ created: "not-a-date" }),
		]);
		expect(b).not.toBeNull();
		expect(b?.min).toBe(Date.parse("2024-01-01T00:00:00Z"));
		expect(b?.max).toBe(Date.parse("2024-06-01T00:00:00Z"));
	});
	it("returns null when no dates parse", () => {
		expect(createdBounds([makeNote({ created: "" })])).toBeNull();
	});
});

describe("visibleAtTime", () => {
	const threshold = Date.parse("2024-03-01T00:00:00Z");
	it("shows notes created at or before the threshold", () => {
		expect(
			visibleAtTime(makeNote({ created: "2024-01-01T00:00:00Z" }), threshold),
		).toBe(true);
		expect(
			visibleAtTime(makeNote({ created: "2024-06-01T00:00:00Z" }), threshold),
		).toBe(false);
	});
	it("always shows notes without a parseable date", () => {
		expect(visibleAtTime(makeNote({ created: "" }), threshold)).toBe(true);
	});
});
