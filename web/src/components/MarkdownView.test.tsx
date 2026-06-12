import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fixtureNote, fixtureVault, makeNote, makeVault } from "@/test/fixture";
import type { Note, VaultData } from "@/types";

// react-pdf / pdfjs do not work in jsdom
vi.mock("@/components/PdfViewer", () => ({
	PdfViewer: ({ src }: { src: string }) => (
		<div data-testid="pdf-viewer">{src}</div>
	),
}));

import { MarkdownView } from "@/components/MarkdownView";

function renderNote(
	note: Note,
	vault: VaultData,
	onSelectNote = vi.fn(),
	onTagClick = vi.fn(),
) {
	const utils = render(
		<TooltipProvider>
			<MarkdownView
				note={note}
				vault={vault}
				onSelectNote={onSelectNote}
				onTagClick={onTagClick}
			/>
		</TooltipProvider>,
	);
	return { ...utils, onSelectNote, onTagClick };
}

describe("MarkdownView with example vault notes", () => {
	it("renders the note title and folder", () => {
		const vault = fixtureVault();
		renderNote(fixtureNote(vault, "links-wikilinks"), vault);
		// the note title plus the note's own "# Wikilinks" markdown heading
		expect(
			screen.getAllByRole("heading", { level: 1, name: "Wikilinks" }).length,
		).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Links").length).toBeGreaterThanOrEqual(1);
	});

	it("renders resolved wikilinks as buttons and navigates on click", async () => {
		const user = userEvent.setup();
		const vault = fixtureVault();
		const { onSelectNote } = renderNote(
			fixtureNote(vault, "links-wikilinks"),
			vault,
		);
		// [[Welcome|Start here]] from the Wikilinks note
		const aliased = screen.getByRole("button", { name: "Start here" });
		expect(aliased.className).toContain("wikilink");
		await user.click(aliased);
		expect(onSelectNote).toHaveBeenCalledWith("welcome", undefined);
	});

	it("passes the anchor for [[Note#Heading]] links", async () => {
		const user = userEvent.setup();
		const vault = fixtureVault();
		const { onSelectNote } = renderNote(
			fixtureNote(vault, "links-wikilinks"),
			vault,
		);
		// [[Code Blocks#TypeScript|TypeScript example]]
		await user.click(
			screen.getByRole("button", { name: "TypeScript example" }),
		);
		expect(onSelectNote).toHaveBeenCalledWith(
			"formatting-code-blocks",
			"#typescript",
		);
	});

	it("renders broken wikilinks as missing", () => {
		const vault = fixtureVault();
		const { container } = renderNote(
			fixtureNote(vault, "links-wikilinks"),
			vault,
		);
		const missing = container.querySelectorAll(".wikilink-missing");
		expect(missing.length).toBeGreaterThanOrEqual(3);
		const texts = [...missing].map((el) => el.textContent);
		expect(texts).toContain("This Note Does Not Exist");
	});

	it("renders callouts with type title and body", () => {
		const vault = fixtureVault();
		renderNote(fixtureNote(vault, "obsidian-callouts"), vault);
		// `> [!NOTE]` with no inline title falls back to the type as written
		expect(screen.getAllByText("NOTE").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("WARNING").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/general information/)).toBeInTheDocument();
	});

	it("gives headings slugified anchor ids", () => {
		const vault = fixtureVault();
		const { container } = renderNote(fixtureNote(vault, "welcome"), vault);
		expect(container.querySelector("#what-it-does")).toBeInTheDocument();
	});

	it("renders note tags and fires onTagClick", async () => {
		const user = userEvent.setup();
		const vault = fixtureVault();
		const { onTagClick } = renderNote(fixtureNote(vault, "welcome"), vault);
		await user.click(screen.getByRole("button", { name: "obsidianator" }));
		expect(onTagClick).toHaveBeenCalledWith("obsidianator");
	});
});

describe("MarkdownView inline Obsidian syntax", () => {
	const vault = makeVault({
		notes: [makeNote({ id: "other", title: "Other" })],
	});

	function renderContent(content: string) {
		const note = makeNote({ id: "synthetic", title: "Synthetic", content });
		return renderNote(note, { ...vault, notes: [...vault.notes, note] });
	}

	it("==highlight== renders a <mark>", () => {
		const { container } = renderContent("This is ==crucial== info.");
		expect(container.querySelector("mark")?.textContent).toBe("crucial");
	});

	it("superscript and subscript render", () => {
		const { container } = renderContent("E = mc^2^ and H~2~O");
		expect(container.querySelector("sup")?.textContent).toBe("2");
		expect(container.querySelector("sub")?.textContent).toBe("2");
	});

	it("custom checkbox states render their icons", () => {
		const { container } = renderContent("- [/] in progress\n- [!] urgent");
		expect(container.querySelector(".cb-progress")).toBeInTheDocument();
		expect(container.querySelector(".cb-important")).toBeInTheDocument();
	});

	it("code blocks render with language label and copy button", () => {
		renderContent("```go\nfunc main() {}\n```");
		expect(screen.getByText("go")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
	});

	it("external links open in a new tab", () => {
		renderContent("[Obsidian](https://obsidian.md)");
		const link = screen.getByRole("link", { name: /Obsidian/ });
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("collapsed callouts hide their body until toggled", async () => {
		const user = userEvent.setup();
		renderContent("> [!note]- Folded title\n> Hidden body text.");
		expect(screen.getByText("Folded title")).toBeInTheDocument();
		expect(screen.queryByText("Hidden body text.")).not.toBeInTheDocument();
		await user.click(screen.getByText("Folded title"));
		expect(screen.getByText("Hidden body text.")).toBeInTheDocument();
	});

	it("PDF embeds render through the PDF viewer", () => {
		const note = makeNote({
			id: "pdf-note",
			title: "Pdf",
			content: "![[Manual.pdf]]",
		});
		const v = makeVault({
			notes: [note],
			attachments: { "manual.pdf": "docs/Manual.pdf" },
		});
		renderNote(note, v);
		expect(screen.getByTestId("pdf-viewer")).toHaveTextContent(
			"./files/docs/Manual.pdf",
		);
	});

	it("transcluded notes render inside a callout-style quote", () => {
		const target = makeNote({
			id: "target",
			title: "Target",
			content: "Transcluded body content.",
		});
		const host = makeNote({
			id: "host",
			title: "Host",
			content: "![[Target]]",
		});
		renderNote(host, makeVault({ notes: [target, host] }));
		expect(screen.getByText("Transcluded body content.")).toBeInTheDocument();
	});
});
