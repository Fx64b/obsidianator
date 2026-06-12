import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/Sidebar";
import { fixtureNote, fixtureVault } from "@/test/fixture";
import type { Note } from "@/types";

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
	const vault = fixtureVault();
	const onSelectNote = vi.fn();
	const onTabChange = vi.fn();
	const onTagChange = vi.fn();
	render(
		<Sidebar
			vault={vault}
			selectedNote={null as Note | null}
			onSelectNote={onSelectNote}
			tab="files"
			onTabChange={onTabChange}
			activeTag={null}
			onTagChange={onTagChange}
			{...overrides}
		/>,
	);
	return { vault, props: { onSelectNote, onTabChange, onTagChange } };
}

describe("Sidebar files tab", () => {
	it("renders root notes and folders from the example vault", () => {
		renderSidebar();
		// Root notes
		expect(screen.getByText("Welcome")).toBeInTheDocument();
		expect(screen.getByText("Getting Started")).toBeInTheDocument();
		// Folders
		for (const folder of [
			"Advanced",
			"Formatting",
			"Links",
			"Obsidian",
			"Graph",
		]) {
			expect(screen.getByText(folder)).toBeInTheDocument();
		}
	});

	it("renders nested folder levels (open by default)", () => {
		renderSidebar();
		expect(screen.getByText("Level 1")).toBeInTheDocument();
		expect(screen.getByText("Level 2")).toBeInTheDocument();
		expect(screen.getByText("Deep Note")).toBeInTheDocument();
	});

	it("clicking a note selects it", async () => {
		const user = userEvent.setup();
		const { props } = renderSidebar();
		await user.click(screen.getByText("Welcome"));
		expect(props.onSelectNote).toHaveBeenCalledTimes(1);
		expect(props.onSelectNote.mock.calls[0][0].id).toBe("welcome");
	});

	it("filter narrows the note list across folders", async () => {
		const user = userEvent.setup();
		renderSidebar();
		await user.type(screen.getByPlaceholderText("Filter notes…"), "deep");
		expect(screen.getByText("Deep Note")).toBeInTheDocument();
		expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
	});

	it("filter shows empty state when nothing matches", async () => {
		const user = userEvent.setup();
		renderSidebar();
		await user.type(screen.getByPlaceholderText("Filter notes…"), "zzzz-none");
		expect(screen.getByText("No matches")).toBeInTheDocument();
	});

	it("shows note and tag counts in the footer", () => {
		const { vault } = renderSidebar();
		expect(
			screen.getByText(
				`${vault.notes.length} notes · ${vault.tags.length} tags`,
			),
		).toBeInTheDocument();
	});

	it("highlights the selected note", () => {
		const vault = fixtureVault();
		renderSidebar({ vault, selectedNote: fixtureNote(vault, "welcome") });
		const btn = screen.getByText("Welcome").closest("button");
		expect(btn?.className).toContain("bg-accent");
	});
});

describe("Sidebar tags tab", () => {
	it("lists tags with usage counts", () => {
		renderSidebar({ tab: "tags" });
		// "obsidian" is used by several notes in the example vault
		expect(screen.getByText("obsidian")).toBeInTheDocument();
		expect(screen.getByText("inline-tag")).toBeInTheDocument();
	});

	it("clicking a tag activates it", async () => {
		const user = userEvent.setup();
		const { props } = renderSidebar({ tab: "tags" });
		await user.click(screen.getByText("obsidian"));
		expect(props.onTagChange).toHaveBeenCalledWith("obsidian");
	});

	it("active tag expands its notes and toggles off on second click", async () => {
		const user = userEvent.setup();
		const { props } = renderSidebar({ tab: "tags", activeTag: "callouts" });
		// notes tagged #callouts appear under the tag
		expect(screen.getByText("Callouts")).toBeInTheDocument();
		await user.click(screen.getByText("callouts"));
		expect(props.onTagChange).toHaveBeenCalledWith(null);
	});

	it("tag filter narrows the list", async () => {
		const user = userEvent.setup();
		renderSidebar({ tab: "tags" });
		await user.type(screen.getByPlaceholderText("Filter tags…"), "graph");
		expect(screen.getByText("graph")).toBeInTheDocument();
		expect(screen.queryByText("inline-tag")).not.toBeInTheDocument();
	});

	it("switching tabs calls onTabChange", async () => {
		const user = userEvent.setup();
		const { props } = renderSidebar();
		await user.click(screen.getByRole("button", { name: "tags" }));
		expect(props.onTabChange).toHaveBeenCalledWith("tags");
	});
});
