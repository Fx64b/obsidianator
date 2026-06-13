import { describe, expect, it } from "vitest";
import {
	hasFilters,
	isEmptyQuery,
	noteMatchesFilters,
	parseSearchQuery,
} from "@/lib/search";
import { makeNote } from "@/test/fixture";

describe("parseSearchQuery", () => {
	it("returns empty structure for blank input", () => {
		const q = parseSearchQuery("");
		expect(isEmptyQuery(q)).toBe(true);
		expect(hasFilters(q)).toBe(false);
	});

	it("treats plain words as free text", () => {
		const q = parseSearchQuery("hello world");
		expect(q.text).toBe("hello world");
		expect(hasFilters(q)).toBe(false);
	});

	it("extracts tag/path/title/line operators", () => {
		const q = parseSearchQuery(
			"tag:project path:notes title:intro line:todo rest",
		);
		expect(q.tags).toEqual(["project"]);
		expect(q.paths).toEqual(["notes"]);
		expect(q.titles).toEqual(["intro"]);
		expect(q.lines).toEqual(["todo"]);
		expect(q.text).toBe("rest");
		expect(hasFilters(q)).toBe(true);
	});

	it("supports #tag shorthand", () => {
		const q = parseSearchQuery("#work meeting");
		expect(q.tags).toEqual(["work"]);
		expect(q.text).toBe("meeting");
	});

	it("supports quoted values with spaces", () => {
		const q = parseSearchQuery('path:"my folder" hello');
		expect(q.paths).toEqual(["my folder"]);
		expect(q.text).toBe("hello");
	});

	it("collects multiple filters of the same kind", () => {
		const q = parseSearchQuery("tag:a tag:b");
		expect(q.tags).toEqual(["a", "b"]);
	});

	it("treats unknown key:value as free text", () => {
		const q = parseSearchQuery("foo:bar");
		expect(q.text).toContain("foo:bar");
		expect(hasFilters(q)).toBe(false);
	});
});

describe("noteMatchesFilters", () => {
	const note = makeNote({
		id: "n",
		title: "Project Intro",
		path: "Work/Notes/Project Intro.md",
		folder: "Work/Notes",
		tags: ["project/active", "team"],
	});

	it("matches a tag filter, including nested tags", () => {
		expect(noteMatchesFilters(note, parseSearchQuery("tag:team"), "")).toBe(
			true,
		);
		expect(noteMatchesFilters(note, parseSearchQuery("tag:project"), "")).toBe(
			true,
		);
		expect(noteMatchesFilters(note, parseSearchQuery("tag:missing"), "")).toBe(
			false,
		);
	});

	it("matches path and title substrings case-insensitively", () => {
		expect(noteMatchesFilters(note, parseSearchQuery("path:work"), "")).toBe(
			true,
		);
		expect(noteMatchesFilters(note, parseSearchQuery("title:intro"), "")).toBe(
			true,
		);
		expect(noteMatchesFilters(note, parseSearchQuery("path:archive"), "")).toBe(
			false,
		);
	});

	it("matches line: against the supplied plain text", () => {
		expect(
			noteMatchesFilters(
				note,
				parseSearchQuery("line:deadline"),
				"the deadline is friday",
			),
		).toBe(true);
		expect(
			noteMatchesFilters(
				note,
				parseSearchQuery("line:deadline"),
				"nothing here",
			),
		).toBe(false);
	});

	it("requires every filter to match (AND semantics)", () => {
		expect(
			noteMatchesFilters(note, parseSearchQuery("tag:team title:intro"), ""),
		).toBe(true);
		expect(
			noteMatchesFilters(note, parseSearchQuery("tag:team title:nope"), ""),
		).toBe(false);
	});
});
