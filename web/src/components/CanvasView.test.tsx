import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CanvasView } from "@/components/CanvasView";
import { makeNote, makeVault } from "@/test/fixture";
import type { Canvas } from "@/types";

function makeCanvas(over: Partial<Canvas> = {}): Canvas {
	return {
		id: "board",
		name: "Board",
		path: "Board.canvas",
		folder: "",
		nodes: [],
		edges: [],
		...over,
	};
}

const note = makeNote({
	id: "welcome",
	title: "Welcome",
	plainText: "Intro text.",
});
const other = makeNote({ id: "other", title: "Other" });
const vault = makeVault({ notes: [note, other] });

function renderCanvas(canvas: Canvas, onSelectNote = vi.fn()) {
	render(
		<CanvasView canvas={canvas} vault={vault} onSelectNote={onSelectNote} />,
	);
	return { onSelectNote };
}

describe("CanvasView", () => {
	it("renders the canvas name overlay", () => {
		renderCanvas(makeCanvas({ name: "My Board" }));
		expect(screen.getByText("My Board")).toBeInTheDocument();
	});

	it("renders a text node as markdown", () => {
		renderCanvas(
			makeCanvas({
				nodes: [
					{
						id: "t",
						type: "text",
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						text: "Hello **bold** world",
					},
				],
			}),
		);
		expect(screen.getByText("bold").tagName).toBe("STRONG");
	});

	it("navigates when a wikilink inside a text node is clicked", async () => {
		const user = userEvent.setup();
		const { onSelectNote } = renderCanvas(
			makeCanvas({
				nodes: [
					{
						id: "t",
						type: "text",
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						text: "See [[Other]].",
					},
				],
			}),
		);
		await user.click(screen.getByRole("button", { name: "Other" }));
		expect(onSelectNote).toHaveBeenCalledWith("other", undefined);
	});

	it("renders a file node with the note title and navigates on click", async () => {
		const user = userEvent.setup();
		const { onSelectNote } = renderCanvas(
			makeCanvas({
				nodes: [
					{
						id: "f",
						type: "file",
						x: 0,
						y: 0,
						width: 250,
						height: 120,
						file: "Welcome.md",
						noteId: "welcome",
					},
				],
			}),
		);
		const btn = screen.getByRole("button", { name: /Welcome/ });
		expect(screen.getByText("Intro text.")).toBeInTheDocument();
		await user.click(btn);
		expect(onSelectNote).toHaveBeenCalledWith("welcome");
	});

	it("renders an image file node from attachments", () => {
		const v = makeVault({
			notes: [],
			attachments: { "diagram.png": "assets/Diagram.png" },
		});
		render(
			<CanvasView
				canvas={makeCanvas({
					nodes: [
						{
							id: "img",
							type: "file",
							x: 0,
							y: 0,
							width: 200,
							height: 150,
							file: "assets/Diagram.png",
						},
					],
				})}
				vault={v}
				onSelectNote={vi.fn()}
			/>,
		);
		const img = screen.getByRole("img", { name: "Diagram.png" });
		expect(img).toHaveAttribute("src", "./files/assets/Diagram.png");
	});

	it("renders a link node as an external anchor", () => {
		renderCanvas(
			makeCanvas({
				nodes: [
					{
						id: "l",
						type: "link",
						x: 0,
						y: 0,
						width: 200,
						height: 80,
						url: "https://obsidian.md",
					},
				],
			}),
		);
		const link = screen.getByRole("link");
		expect(link).toHaveAttribute("href", "https://obsidian.md");
		expect(link).toHaveAttribute("target", "_blank");
	});

	it("renders a group label", () => {
		renderCanvas(
			makeCanvas({
				nodes: [
					{
						id: "g",
						type: "group",
						x: 0,
						y: 0,
						width: 400,
						height: 300,
						label: "Section A",
					},
				],
			}),
		);
		expect(screen.getByText("Section A")).toBeInTheDocument();
	});

	it("draws edges as svg paths", () => {
		const { container } = render(
			<CanvasView
				canvas={makeCanvas({
					nodes: [
						{
							id: "a",
							type: "text",
							x: 0,
							y: 0,
							width: 100,
							height: 100,
							text: "A",
						},
						{
							id: "b",
							type: "text",
							x: 300,
							y: 0,
							width: 100,
							height: 100,
							text: "B",
						},
					],
					edges: [{ id: "e", fromNode: "a", toNode: "b", toEnd: "arrow" }],
				})}
				vault={vault}
				onSelectNote={vi.fn()}
			/>,
		);
		expect(container.querySelector("svg path")).toBeInTheDocument();
		// arrowhead polygon present for toEnd: arrow
		expect(container.querySelector("svg polygon")).toBeInTheDocument();
	});

	it("ignores edges referencing missing nodes", () => {
		const { container } = render(
			<CanvasView
				canvas={makeCanvas({
					nodes: [
						{
							id: "a",
							type: "text",
							x: 0,
							y: 0,
							width: 100,
							height: 100,
							text: "A",
						},
					],
					edges: [{ id: "e", fromNode: "a", toNode: "ghost" }],
				})}
				vault={vault}
				onSelectNote={vi.fn()}
			/>,
		);
		expect(container.querySelector("svg path")).not.toBeInTheDocument();
	});
});
