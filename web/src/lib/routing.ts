// Routing mode support.
//
// The SPA runs in one of two modes:
// - "hash" (default): note navigation via location.hash (#<noteId>). Used
//   when the app is loaded from index.html (serve mode or the export root).
// - "path": real per-note URLs (<noteId>.html). Used when the app is loaded
//   from one of the pre-rendered note pages the exporter writes; the Go side
//   marks those pages with data attributes on #root (an inline <script>
//   would violate the serve-mode CSP).

export type RoutingMode = "hash" | "path";

// Mirrors NotePageFilename in internal/export/seo.go — a note whose id would
// collide with the SPA entry point gets a -note suffix.
export function notePageFilename(id: string): string {
	return id === "index" ? "index-note.html" : `${id}.html`;
}

// Inverse of notePageFilename for a URL pathname; null when the path is not
// a note page (e.g. "/", "/index.html").
export function noteIdFromPath(pathname: string): string | null {
	const base = pathname.split("/").pop() ?? "";
	if (!base.endsWith(".html")) return null;
	const stem = decodeURIComponent(base.slice(0, -".html".length));
	if (stem === "index-note") return "index";
	if (stem === "" || stem === "index") return null;
	return stem;
}

export interface PageContext {
	routing: RoutingMode;
	// Note id the page was pre-rendered for (path mode only).
	initialNoteId: string | null;
}

// Reads the page context the exporter stamped onto #root. Must be called
// after the DOM exists; React render clears #root's children but leaves its
// attributes intact.
export function getPageContext(): PageContext {
	const root = document.getElementById("root");
	if (root?.dataset.routing === "path") {
		return {
			routing: "path",
			initialNoteId: root.dataset.noteId || noteIdFromPath(location.pathname),
		};
	}
	return { routing: "hash", initialNoteId: null };
}

// The URL (relative, suitable for pushState/replaceState) for a note in the
// given routing mode.
export function noteUrl(noteId: string, routing: RoutingMode): string {
	return routing === "path" ? `./${notePageFilename(noteId)}` : `#${noteId}`;
}

// The note id encoded in the current location, per routing mode.
export function noteIdFromLocation(routing: RoutingMode): string | null {
	if (routing === "path") return noteIdFromPath(location.pathname);
	return location.hash.slice(1) || null;
}
