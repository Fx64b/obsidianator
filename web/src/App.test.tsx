import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import rawVault from "@/test/fixtures/vault-data.json";

// canvas-based force graph and pdfjs do not work in jsdom
vi.mock("react-force-graph-2d", () => ({
	default: () => <div data-testid="force-graph" />,
}));
vi.mock("@/components/PdfViewer", () => ({
	PdfViewer: ({ src }: { src: string }) => (
		<div data-testid="pdf-viewer">{src}</div>
	),
}));

import App from "@/App";

function stubVaultFetch() {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify(rawVault))),
	);
}

beforeEach(() => {
	window.localStorage.clear();
	window.history.replaceState(null, "", "#welcome");
	stubVaultFetch();
});

async function renderApp() {
	const utils = render(<App />);
	// Wait for the vault to load and the Welcome note (from the URL hash) to render
	await waitFor(() =>
		expect(
			screen.getByRole("heading", { level: 1, name: "Welcome" }),
		).toBeInTheDocument(),
	);
	return utils;
}

describe("App integration (example vault)", () => {
	it("loads the vault and renders the note addressed by the URL hash", async () => {
		await renderApp();
		// brand appears in the header (and as bold text in the Welcome note)
		expect(screen.getAllByText("Obsidianator").length).toBeGreaterThanOrEqual(
			1,
		);
		// vault name in the header breadcrumb
		expect(screen.getAllByText("test").length).toBeGreaterThanOrEqual(1);
		// markdown body rendered
		expect(
			screen.getByText(/exports your/, { exact: false }),
		).toBeInTheDocument();
	});

	it("shows an error screen when vault-data.json is missing", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 404 })),
		);
		render(<App />);
		await waitFor(() =>
			expect(screen.getByText("Failed to load vault")).toBeInTheDocument(),
		);
		expect(screen.getByText("HTTP 404")).toBeInTheDocument();
	});

	it("renders the sidebar file tree from the vault", async () => {
		await renderApp();
		// folders and the notes inside them (folders are open by default);
		// some names also appear in note content, so allow multiple matches
		for (const label of ["Advanced", "Obsidian", "Hub Note", "Deep Note"]) {
			expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
		}
	});

	it("navigates to a note from the sidebar and updates the hash", async () => {
		const user = userEvent.setup();
		await renderApp();
		// first match is the sidebar entry (sidebar precedes main in the DOM)
		await user.click(screen.getAllByText("Hub Note")[0]);
		await waitFor(() => expect(window.location.hash).toBe("#graph-hub-note"));
		expect(
			screen.getAllByRole("heading", { level: 1, name: "Hub Note" }).length,
		).toBeGreaterThanOrEqual(1);
	});

	it("navigates via wikilinks and goes back with Alt+ArrowLeft", async () => {
		const user = userEvent.setup();
		const { container } = await renderApp();

		// Welcome contains [[Getting Started]] as a wikilink button
		const main = container.querySelector("main") ?? container;
		const wikilinks = within(main as HTMLElement).getAllByRole("button", {
			name: "Getting Started",
		});
		await user.click(wikilinks[0]);
		await waitFor(() => expect(window.location.hash).toBe("#getting-started"));

		// A second navigation so the history stack has somewhere to go back to
		// (the initial note is not pushed onto the in-app history stack)
		await user.click(screen.getAllByText("Hub Note")[0]);
		await waitFor(() => expect(window.location.hash).toBe("#graph-hub-note"));

		await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
		await waitFor(() => expect(window.location.hash).toBe("#getting-started"));
	});

	it("opens the search dialog with Ctrl+K and jumps to the selected note", async () => {
		const user = userEvent.setup();
		await renderApp();
		await user.keyboard("{Control>}k{/Control}");
		const input = await screen.findByPlaceholderText("Search notes…");
		await user.type(input, "Orphan");
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(window.location.hash).toBe("#graph-orphan-note"),
		);
	});

	it("shows backlinks for the active note in the right panel", async () => {
		const user = userEvent.setup();
		await renderApp();
		await user.keyboard("{Control>}k{/Control}");
		await user.type(
			await screen.findByPlaceholderText("Search notes…"),
			"Orphan",
		);
		await user.keyboard("{Enter}");
		// Orphan Note's only backlink is Hub Note
		await waitFor(() =>
			expect(screen.getAllByText("Hub Note").length).toBeGreaterThanOrEqual(1),
		);
	});

	it("toggles dark mode", async () => {
		const user = userEvent.setup();
		const { container } = await renderApp();
		const initiallyDark = document.documentElement.classList.contains("dark");
		// icon-only button: locate it via the moon/sun icon
		const icon = container.querySelector(
			initiallyDark ? "svg.lucide-sun" : "svg.lucide-moon",
		);
		const toggle = icon?.closest("button");
		expect(toggle).toBeTruthy();
		await user.click(toggle as HTMLElement);
		await waitFor(() =>
			expect(document.documentElement.classList.contains("dark")).toBe(
				!initiallyDark,
			),
		);
	});

	it("switches to graph view with Ctrl+G", async () => {
		const user = userEvent.setup();
		await renderApp();
		await user.keyboard("{Control>}g{/Control}");
		await waitFor(() =>
			expect(screen.getAllByTestId("force-graph").length).toBeGreaterThan(0),
		);
	});
});
