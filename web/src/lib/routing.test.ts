import { afterEach, describe, expect, it } from "vitest";
import {
	getPageContext,
	noteIdFromPath,
	notePageFilename,
	noteUrl,
} from "@/lib/routing";

describe("notePageFilename", () => {
	it("appends .html to the note id", () => {
		expect(notePageFilename("welcome")).toBe("welcome.html");
		expect(notePageFilename("links-embeds")).toBe("links-embeds.html");
	});

	it("avoids colliding with the SPA entry point", () => {
		expect(notePageFilename("index")).toBe("index-note.html");
	});
});

describe("noteIdFromPath", () => {
	it("extracts the note id from a page path", () => {
		expect(noteIdFromPath("/welcome.html")).toBe("welcome");
		expect(noteIdFromPath("/some/dir/links-embeds.html")).toBe("links-embeds");
	});

	it("maps the reserved filename back to its id", () => {
		expect(noteIdFromPath("/index-note.html")).toBe("index");
	});

	it("returns null for non-note paths", () => {
		expect(noteIdFromPath("/")).toBeNull();
		expect(noteIdFromPath("/index.html")).toBeNull();
		expect(noteIdFromPath("/files/image.png")).toBeNull();
	});
});

describe("noteUrl", () => {
	it("hash mode → #id", () => {
		expect(noteUrl("welcome", "hash")).toBe("#welcome");
	});

	it("path mode → relative page filename", () => {
		expect(noteUrl("welcome", "path")).toBe("./welcome.html");
		expect(noteUrl("index", "path")).toBe("./index-note.html");
	});
});

describe("getPageContext", () => {
	afterEach(() => {
		document.getElementById("root")?.remove();
	});

	function mountRoot(attrs: Record<string, string>) {
		const root = document.createElement("div");
		root.id = "root";
		for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
		document.body.appendChild(root);
	}

	it("defaults to hash mode without a #root marker", () => {
		expect(getPageContext()).toEqual({ routing: "hash", initialNoteId: null });
	});

	it("reads path mode and the initial note from #root data attributes", () => {
		mountRoot({ "data-routing": "path", "data-note-id": "welcome" });
		expect(getPageContext()).toEqual({
			routing: "path",
			initialNoteId: "welcome",
		});
	});

	it("ignores unknown routing values", () => {
		mountRoot({ "data-routing": "weird" });
		expect(getPageContext().routing).toBe("hash");
	});
});
