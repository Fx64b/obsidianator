import { describe, expect, it } from "vitest";
import {
	findNote,
	preprocessContent,
	resolveEmbedsInBody,
	slugify,
} from "@/lib/markdown";
import { makeNote, makeVault } from "@/test/fixture";

const vault = makeVault({
	notes: [
		makeNote({
			id: "welcome",
			title: "Welcome",
			content: "---\ntitle: Welcome\n---\n# Welcome\n\nHello world.",
		}),
		makeNote({
			id: "sub-deep-note",
			title: "Deep Note",
			aliases: ["DN", "The Deep One"],
		}),
		makeNote({ id: "notes-readme", title: "ReadMe" }),
	],
	attachments: {
		"image.png": "assets/Image.png",
		"report.pdf": "docs/Report.pdf",
	},
});

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
	it.each([
		["Hello World", "hello-world"],
		["What it does", "what-it-does"],
		["C++ Tips & Tricks", "c-tips-tricks"],
		["  spaces  ", "spaces"],
		["Already-slugged", "already-slugged"],
		["Under_score", "under-score"],
	])("%s → %s", (input, want) => {
		expect(slugify(input)).toBe(want);
	});
});

// ── findNote (4-tier resolution) ──────────────────────────────────────────────

describe("findNote", () => {
	it("tier 1: exact title", () => {
		expect(findNote("Welcome", vault)?.id).toBe("welcome");
	});

	it("tier 2: case-insensitive title", () => {
		expect(findNote("wElCoMe", vault)?.id).toBe("welcome");
		expect(findNote("readme", vault)?.id).toBe("notes-readme");
	});

	it("tier 3: alias match, case-insensitive", () => {
		expect(findNote("DN", vault)?.id).toBe("sub-deep-note");
		expect(findNote("the deep one", vault)?.id).toBe("sub-deep-note");
	});

	it("tier 4: id slug suffix", () => {
		expect(findNote("deep-note", vault)?.id).toBe("sub-deep-note");
	});

	it("trims whitespace", () => {
		expect(findNote("  Welcome  ", vault)?.id).toBe("welcome");
	});

	it("returns undefined for unknown targets", () => {
		expect(findNote("Nonexistent", vault)).toBeUndefined();
	});
});

// ── preprocessContent ─────────────────────────────────────────────────────────

describe("preprocessContent", () => {
	const pre = (content: string) => preprocessContent(content, vault);

	it("strips frontmatter", () => {
		const out = pre("---\ntitle: X\ntags: [a]\n---\nBody text.");
		expect(out).not.toContain("title: X");
		expect(out).toContain("Body text.");
	});

	describe("wikilinks", () => {
		it("resolves [[Title]] to wiki: link", () => {
			expect(pre("See [[Welcome]].")).toContain("[Welcome](wiki:welcome)");
		});

		it("uses alias as display text", () => {
			expect(pre("[[Welcome|Start here]]")).toContain(
				"[Start here](wiki:welcome)",
			);
		});

		it("appends slugified anchors", () => {
			expect(pre("[[Welcome#Some Heading]]")).toContain(
				"[Welcome](wiki:welcome#some-heading)",
			);
		});

		it("anchor with alias", () => {
			expect(pre("[[Welcome#Some Heading|jump]]")).toContain(
				"[jump](wiki:welcome#some-heading)",
			);
		});

		it("same-note anchor [[#Heading]] becomes plain hash link", () => {
			expect(pre("[[#My Section]]")).toContain("[My Section](#my-section)");
		});

		it("unresolved links become wiki-missing:", () => {
			expect(pre("[[No Such Note]]")).toContain(
				"[No Such Note](wiki-missing:No%20Such%20Note)",
			);
		});

		it("resolves via alias", () => {
			expect(pre("[[DN]]")).toContain("[DN](wiki:sub-deep-note)");
		});
	});

	describe("embeds", () => {
		it("image embed resolves to ./files/ path with original casing", () => {
			expect(pre("![[Image.png]]")).toContain(
				"![Image.png](./files/assets/Image.png)",
			);
		});

		it("image embed with width becomes an img tag", () => {
			expect(pre("![[Image.png|200]]")).toContain(
				'<img src="./files/assets/Image.png" alt="Image.png" width="200" />',
			);
		});

		it("image embed with width x height", () => {
			expect(pre("![[Image.png|200x100]]")).toContain(
				'width="200" height="100"',
			);
		});

		it("unknown image falls back to bare name", () => {
			expect(pre("![[missing.png]]")).toContain("![missing.png](missing.png)");
		});

		it("pdf embed becomes a PDF sentinel with encoded spaces", () => {
			expect(pre("![[Report.pdf]]")).toContain(
				"![Report.pdf](__PDF_EMBED__docs/Report.pdf)",
			);
		});

		it("note transclusion quotes the target body with attribution", () => {
			const out = pre("![[Welcome]]");
			expect(out).toContain("> # Welcome");
			expect(out).toContain("> Hello world.");
			// the attribution wikilink is itself resolved by the later wikilink pass
			expect(out).toContain("— *[Welcome](wiki:welcome)*");
			// the transcluded frontmatter must not leak
			expect(out).not.toContain("title: Welcome");
		});

		it("unresolvable embeds degrade to inline code", () => {
			// The embed pass wraps it in backticks; the wikilink pass then still
			// rewrites the inner [[...]] (inline code is not protected).
			expect(pre("![[whatever.xyz]]")).toContain(
				"`![whatever.xyz](wiki-missing:whatever.xyz)`",
			);
		});
	});

	describe("callouts", () => {
		it("emits a sentinel span with type and title", () => {
			const out = pre("> [!warning] Be careful\n> Body line.");
			expect(out).toContain('data-callout="WARNING"');
			expect(out).toContain(
				`data-callout-title="${encodeURIComponent("Be careful")}"`,
			);
			expect(out).toContain('data-callout-collapsed="false"');
			expect(out).toContain("> Body line.");
		});

		it("title defaults to capitalized type", () => {
			const out = pre("> [!tip]\n> Body.");
			expect(out).toContain(
				`data-callout-title="${encodeURIComponent("Tip")}"`,
			);
		});

		it("collapsed marker is carried as attribute", () => {
			const out = pre("> [!note]- Folded\n> Hidden body.");
			expect(out).toContain('data-callout-collapsed="true"');
		});

		it("converts ad-* admonition code fences", () => {
			const out = pre(
				"```ad-warning\ntitle: Watch out\nSome admonition body\n```",
			);
			expect(out).toContain('data-callout="WARNING"');
			expect(out).toContain(
				`data-callout-title="${encodeURIComponent("Watch out")}"`,
			);
			expect(out).toContain("> Some admonition body");
			expect(out).not.toContain("```ad-warning");
		});
	});

	describe("inline syntax", () => {
		it("==highlight== → <mark>", () => {
			expect(pre("a ==big deal== here")).toContain("<mark>big deal</mark>");
		});

		it("^sup^ → <sup>", () => {
			expect(pre("E = mc^2^")).toContain("E = mc<sup>2</sup>");
		});

		it("~sub~ → <sub>", () => {
			expect(pre("H~2~O")).toContain("H<sub>2</sub>O");
		});

		it("~~strikethrough~~ untouched", () => {
			expect(pre("~~gone~~")).toContain("~~gone~~");
		});

		it("inline #tags become tag: links", () => {
			expect(pre("about #my-tag here")).toContain("[#my-tag](tag:my-tag)");
		});

		it("nested tags keep the slash", () => {
			expect(pre("see #projects/active")).toContain(
				"[#projects/active](tag:projects%2Factive)",
			);
		});

		it("numeric-leading hashes are not tags", () => {
			expect(pre("issue #123")).not.toContain("tag:123");
		});

		it("inline footnotes ^[text] become real footnotes", () => {
			const out = pre("Fact.^[source needed]");
			expect(out).toContain("[^fn-inline-0]");
			expect(out).toContain("[^fn-inline-0]: source needed");
		});
	});

	describe("custom checkbox states", () => {
		it.each([
			["- [/] doing", "cb-progress"],
			["- [-] dropped", "cb-cancelled"],
			["- [!] urgent", "cb-important"],
			["- [?] unsure", "cb-question"],
			["- [*] starred", "cb-star"],
			["- [>] forwarded", "cb-forward"],
		])("%s renders %s", (line, cls) => {
			expect(pre(line)).toContain(cls);
		});

		it("standard checkboxes untouched", () => {
			expect(pre("- [x] done")).toContain("- [x] done");
			expect(pre("- [ ] todo")).toContain("- [ ] todo");
		});
	});

	describe("code block protection", () => {
		it("wikilinks and tags inside fenced code are not transformed", () => {
			const code = "```md\n[[Welcome]] and #tag and ==marked==\n```";
			const out = pre(code);
			expect(out).toContain("[[Welcome]] and #tag and ==marked==");
			expect(out).not.toContain("wiki:welcome");
		});

		it("code blocks restored verbatim", () => {
			const code = "```go\nfunc main() {}\n```";
			expect(pre(`before\n\n${code}\n\nafter`)).toContain(code);
		});
	});
});

// ── resolveEmbedsInBody ───────────────────────────────────────────────────────

describe("resolveEmbedsInBody", () => {
	it("rewrites image embeds inside transcluded bodies", () => {
		expect(resolveEmbedsInBody("intro ![[Image.png]] outro", vault)).toBe(
			"intro ![Image.png](./files/assets/Image.png) outro",
		);
	});

	it("rewrites pdf embeds", () => {
		expect(resolveEmbedsInBody("![[Report.pdf]]", vault)).toContain(
			"__PDF_EMBED__docs/Report.pdf",
		);
	});

	it("leaves note embeds as inline code (no recursive transclusion)", () => {
		expect(resolveEmbedsInBody("![[Welcome]]", vault)).toBe("`![[Welcome]]`");
	});
});
