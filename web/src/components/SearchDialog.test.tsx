import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchDialog } from "@/components/SearchDialog";
import { fixtureVault } from "@/test/fixture";

function renderDialog(onSelectNote = vi.fn(), onOpenChange = vi.fn()) {
	const vault = fixtureVault();
	render(
		<SearchDialog
			open={true}
			onOpenChange={onOpenChange}
			vault={vault}
			onSelectNote={onSelectNote}
		/>,
	);
	return { vault, onSelectNote, onOpenChange };
}

describe("SearchDialog", () => {
	it("shows the first notes by default", () => {
		renderDialog();
		expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
		// 10 default results + result count footer
		expect(screen.getByText("10 results")).toBeInTheDocument();
	});

	it("finds notes by fuzzy title match", async () => {
		const user = userEvent.setup();
		renderDialog();
		await user.type(screen.getByPlaceholderText(/Search/), "wikilink");
		// result titles are split by the match-highlight <mark>, so compare
		// whole textContent of the title paragraphs
		await waitFor(() => {
			const titles = [...document.querySelectorAll("p")].map(
				(el) => el.textContent,
			);
			expect(titles).toContain("Wikilinks");
		});
	});

	it("falls back to full-text search over plainText", async () => {
		const user = userEvent.setup();
		renderDialog();
		// phrase that only appears in Hub Note's body, not in any title
		await user.type(screen.getByPlaceholderText(/Search/), "degree centrality");
		await waitFor(() => {
			expect(screen.getByText(/Hub Note/)).toBeInTheDocument();
		});
	});

	it("shows an empty state for nonsense queries", async () => {
		const user = userEvent.setup();
		renderDialog();
		await user.type(
			screen.getByPlaceholderText(/Search/),
			"zzzqqqxxx-no-such-thing",
		);
		await waitFor(() => {
			expect(screen.getByText(/No results for/)).toBeInTheDocument();
		});
	});

	it("selects the top result with Enter and closes", async () => {
		const user = userEvent.setup();
		const { onSelectNote, onOpenChange } = renderDialog();
		await user.type(screen.getByPlaceholderText(/Search/), "Welcome");
		await user.keyboard("{Enter}");
		expect(onSelectNote).toHaveBeenCalledTimes(1);
		expect(onSelectNote.mock.calls[0][0].title).toBe("Welcome");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("selects a result by clicking it", async () => {
		const user = userEvent.setup();
		const { onSelectNote } = renderDialog();
		await user.type(screen.getByPlaceholderText(/Search/), "Callouts");
		const hits = await screen.findAllByText("Callouts");
		await user.click(hits[0]);
		expect(onSelectNote.mock.calls[0][0].id).toBe("obsidian-callouts");
	});

	it("filters by the title: operator", async () => {
		const user = userEvent.setup();
		renderDialog();
		await user.type(screen.getByPlaceholderText(/Search/), "title:wikilinks");
		await waitFor(() => {
			const titles = [...document.querySelectorAll("p")].map(
				(el) => el.textContent,
			);
			expect(titles).toContain("Wikilinks");
			// notes without "wikilinks" in the title are filtered out
			expect(titles).not.toContain("Callouts");
		});
	});

	it("filters by the tag: operator", async () => {
		const user = userEvent.setup();
		renderDialog();
		await user.type(screen.getByPlaceholderText(/Search/), "tag:transclusion");
		await waitFor(() => {
			const titles = [...document.querySelectorAll("p")].map(
				(el) => el.textContent,
			);
			expect(titles).toContain("Transclusion");
			expect(titles).not.toContain("Callouts");
		});
	});

	it("navigates results with arrow keys", async () => {
		const user = userEvent.setup();
		const { onSelectNote } = renderDialog();
		const input = screen.getByPlaceholderText(/Search/);
		await user.type(input, "Frontmatter");
		await screen.findAllByText("Frontmatter");
		await user.keyboard("{ArrowDown}{Enter}");
		// second result selected, not the first
		expect(onSelectNote).toHaveBeenCalledTimes(1);
		expect(onSelectNote.mock.calls[0][0].title).not.toBe("Frontmatter");
	});
});
