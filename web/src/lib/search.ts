import type { Note } from "@/types";

// A search query parsed into structured filters plus the remaining free text.
// Supported operators (space-separated, combinable):
//   tag:foo      note has tag "foo" (or a nested tag under "foo/")
//   #foo         shorthand for tag:foo
//   path:foo     note path/folder contains "foo"
//   title:foo    note title contains "foo"
//   line:foo     note body contains "foo" (forces a content match)
// Values may be quoted to include spaces: path:"my folder".
export interface ParsedQuery {
	tags: string[];
	paths: string[];
	titles: string[];
	lines: string[];
	text: string;
}

const TOKEN_RE = /(\w+):"([^"]*)"|(\w+):(\S+)|#(\S+)|"([^"]*)"|(\S+)/g;

const FILTER_KEYS = new Set(["tag", "path", "title", "line"]);

export function parseSearchQuery(raw: string): ParsedQuery {
	const q: ParsedQuery = {
		tags: [],
		paths: [],
		titles: [],
		lines: [],
		text: "",
	};
	const textParts: string[] = [];

	for (const m of raw.matchAll(TOKEN_RE)) {
		const key = (m[1] ?? m[3])?.toLowerCase();
		const value = m[2] ?? m[4];
		const hashTag = m[5];
		const quoted = m[6];
		const bare = m[7];

		if (key && FILTER_KEYS.has(key) && value) {
			if (key === "tag") q.tags.push(value);
			else if (key === "path") q.paths.push(value);
			else if (key === "title") q.titles.push(value);
			else if (key === "line") q.lines.push(value);
			continue;
		}
		if (hashTag) {
			q.tags.push(hashTag);
			continue;
		}
		// A `key:value` we don't recognise, or a bare/quoted word → free text.
		if (quoted !== undefined) textParts.push(quoted);
		else if (bare !== undefined) textParts.push(bare);
		else if (m[0]) textParts.push(m[0]);
	}

	q.text = textParts.join(" ").trim();
	return q;
}

// True when the query carries no filters and no free text.
export function isEmptyQuery(q: ParsedQuery): boolean {
	return (
		q.tags.length === 0 &&
		q.paths.length === 0 &&
		q.titles.length === 0 &&
		q.lines.length === 0 &&
		q.text === ""
	);
}

// True when the query has any structured filter (vs. only free text).
export function hasFilters(q: ParsedQuery): boolean {
	return (
		q.tags.length > 0 ||
		q.paths.length > 0 ||
		q.titles.length > 0 ||
		q.lines.length > 0
	);
}

function tagMatches(noteTags: string[], filter: string): boolean {
	const f = filter.toLowerCase().replace(/^#/, "");
	return noteTags.some((t) => {
		const lt = t.toLowerCase();
		return lt === f || lt.startsWith(`${f}/`);
	});
}

// Apply the structured filters (tag/path/title/line) to a note. `plainText`
// is resolved by the caller so chunked vaults can supply it lazily.
export function noteMatchesFilters(
	note: Note,
	q: ParsedQuery,
	plainText: string,
): boolean {
	for (const tag of q.tags) {
		if (!tagMatches(note.tags, tag)) return false;
	}
	const pathLower = `${note.path} ${note.folder}`.toLowerCase();
	for (const p of q.paths) {
		if (!pathLower.includes(p.toLowerCase())) return false;
	}
	const titleLower = note.title.toLowerCase();
	for (const t of q.titles) {
		if (!titleLower.includes(t.toLowerCase())) return false;
	}
	const textLower = plainText.toLowerCase();
	for (const l of q.lines) {
		if (!textLower.includes(l.toLowerCase())) return false;
	}
	return true;
}
