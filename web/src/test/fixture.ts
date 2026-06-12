import type { Note, VaultData } from "@/types";
import raw from "./fixtures/vault-data.json";

// vault-data.json is generated from the example vault at data/test by running:
//   go run . export data/test --output <tmp>   (then copying vault-data.json)
// It exercises the full Go parser output against the frontend.
export function fixtureVault(): VaultData {
	return structuredClone(raw) as unknown as VaultData;
}

export function fixtureNote(vault: VaultData, id: string): Note {
	const note = vault.notes.find((n) => n.id === id);
	if (!note) throw new Error(`fixture note ${id} not found`);
	return note;
}

// Minimal hand-rolled note for synthetic test content.
export function makeNote(overrides: Partial<Note>): Note {
	return {
		id: "test-note",
		title: "Test Note",
		aliases: [],
		path: "Test Note.md",
		content: "",
		plainText: "",
		tags: [],
		links: [],
		backlinks: [],
		frontmatter: {},
		headers: [],
		folder: "",
		modified: "2024-01-01T00:00:00Z",
		created: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

export function makeVault(overrides: Partial<VaultData> = {}): VaultData {
	return {
		name: "test",
		notes: [],
		tags: [],
		folders: [],
		edges: [],
		attachments: {},
		...overrides,
	};
}
