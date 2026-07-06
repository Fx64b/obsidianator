import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NotePreviewBody, WikilinkPreview } from "@/components/WikilinkPreview";
import { makeNote, makeVault } from "@/test/fixture";

const sectioned = makeNote({
	id: "sectioned",
	title: "Sectioned",
	folder: "Stuff",
	content:
		"## One\n\nFirst section.\n\n## Two\n\nSecond section. ^block-x\n\n## Three\n\nThird section.",
});

describe("NotePreviewBody", () => {
	it("renders title, folder, and rendered content", () => {
		const note = makeNote({
			id: "n",
			title: "My Note",
			folder: "Stuff",
			content: "Hello **world**.",
		});
		render(
			<NotePreviewBody note={note} vault={makeVault({ notes: [note] })} />,
		);
		expect(screen.getByText("My Note")).toBeInTheDocument();
		expect(screen.getByText("Stuff")).toBeInTheDocument();
		expect(screen.getByText("world")).toBeInTheDocument();
	});

	it("shows only the linked section for heading anchors", () => {
		render(
			<NotePreviewBody
				note={sectioned}
				anchor="two"
				vault={makeVault({ notes: [sectioned] })}
			/>,
		);
		expect(screen.getByText("Second section.")).toBeInTheDocument();
		expect(screen.queryByText("First section.")).not.toBeInTheDocument();
	});

	it("shows only the linked block for block-id anchors", () => {
		render(
			<NotePreviewBody
				note={sectioned}
				anchor="block-x"
				vault={makeVault({ notes: [sectioned] })}
			/>,
		);
		expect(screen.getByText("Second section.")).toBeInTheDocument();
		expect(screen.queryByText("Third section.")).not.toBeInTheDocument();
	});

	it("falls back to the full note for unknown anchors", () => {
		render(
			<NotePreviewBody
				note={sectioned}
				anchor="does-not-exist"
				vault={makeVault({ notes: [sectioned] })}
			/>,
		);
		expect(screen.getByText("First section.")).toBeInTheDocument();
		expect(screen.getByText("Third section.")).toBeInTheDocument();
	});

	it("renders wikilinks inertly — no interactive buttons inside previews", () => {
		const other = makeNote({ id: "other", title: "Other" });
		const note = makeNote({ id: "n", title: "N", content: "See [[Other]]." });
		render(
			<NotePreviewBody
				note={note}
				vault={makeVault({ notes: [note, other] })}
			/>,
		);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByText("Other")).toBeInTheDocument();
	});

	it("strips block-anchor ids so previews cannot shadow note anchors", () => {
		const note = makeNote({
			id: "n",
			title: "N",
			content: "Tagged paragraph. ^my-block",
		});
		const { container } = render(
			<NotePreviewBody note={note} vault={makeVault({ notes: [note] })} />,
		);
		expect(container.querySelector('[id="my-block"]')).not.toBeInTheDocument();
		expect(screen.getByText("Tagged paragraph.")).toBeInTheDocument();
	});

	it("shows a placeholder for empty notes", () => {
		const note = makeNote({ id: "n", title: "Empty", content: "" });
		render(
			<NotePreviewBody note={note} vault={makeVault({ notes: [note] })} />,
		);
		expect(screen.getByText("Empty note")).toBeInTheDocument();
	});
});

describe("WikilinkPreview", () => {
	it("opens a preview card on hover", async () => {
		const user = userEvent.setup();
		const target = makeNote({
			id: "target",
			title: "Target Note",
			content: "Preview body text.",
		});
		render(
			<WikilinkPreview noteId="target" vault={makeVault({ notes: [target] })}>
				<button type="button">link</button>
			</WikilinkPreview>,
		);
		await user.hover(screen.getByRole("button", { name: "link" }));
		expect(
			await screen.findByText("Preview body text.", {}, { timeout: 3000 }),
		).toBeInTheDocument();
	});

	it("renders children unchanged when the note id is unknown", () => {
		render(
			<WikilinkPreview noteId="nope" vault={makeVault()}>
				<button type="button">plain</button>
			</WikilinkPreview>,
		);
		expect(screen.getByRole("button", { name: "plain" })).toBeInTheDocument();
	});
});
