import type { Edge, Note } from "@/types";

export type ColorMode = "folder" | "tag";

// The grouping key used to color a node. Folder mode uses the top-level
// folder; tag mode uses the note's first tag. Returns "" when the note has no
// folder/tag (rendered in a neutral color).
export function nodeGroup(note: Note, mode: ColorMode): string {
	if (mode === "tag") return note.tags[0] ?? "";
	return note.folder ? note.folder.split("/")[0] : "";
}

// Ids of notes with no connections at all (no outgoing links and no
// backlinks). Computed from the edge list so it matches what the graph draws.
export function orphanIdSet(notes: Note[], edges: Edge[]): Set<string> {
	const connected = new Set<string>();
	for (const e of edges) {
		connected.add(e.source);
		connected.add(e.target);
	}
	const orphans = new Set<string>();
	for (const n of notes) {
		if (!connected.has(n.id)) orphans.add(n.id);
	}
	return orphans;
}

// Min/max created timestamps (ms) across notes with a parseable created date,
// for the time-lapse slider. Returns null when no note has a usable date.
export function createdBounds(
	notes: Note[],
): { min: number; max: number } | null {
	let min = Infinity;
	let max = -Infinity;
	for (const n of notes) {
		const t = Date.parse(n.created);
		if (Number.isNaN(t)) continue;
		if (t < min) min = t;
		if (t > max) max = t;
	}
	if (min === Infinity) return null;
	return { min, max };
}

// Whether a note should be visible at a given time-lapse threshold (ms).
// Notes without a parseable created date are always shown so the time-lapse
// never hides content permanently.
export function visibleAtTime(note: Note, thresholdMs: number): boolean {
	const t = Date.parse(note.created);
	if (Number.isNaN(t)) return true;
	return t <= thresholdMs;
}
