import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNoteContent } from "@/hooks/useNoteContent";
import { makeNote, makeVault } from "@/test/fixture";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useNoteContent (non-chunked)", () => {
	it("returns the vault unchanged and never fetches", () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const vault = makeVault({
			notes: [makeNote({ id: "a", content: "Body A" })],
		});
		const { result } = renderHook(() => useNoteContent(vault));
		expect(result.current.hydratedVault).toBe(vault);
		expect(result.current.ready("a")).toBe(true);
		act(() => result.current.ensure(["a"]));
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe("useNoteContent (chunked)", () => {
	const vault = makeVault({
		chunked: true,
		notes: [
			makeNote({ id: "a", content: "", plainText: "" }),
			makeNote({ id: "b", content: "", plainText: "" }),
		],
	});

	it("fetches a chunk and merges its content into the hydrated vault", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => ({
				ok: true,
				json: async () =>
					url.includes("/notes/a.json")
						? { id: "a", content: "Loaded A", plainText: "Loaded A" }
						: {},
			})),
		);

		const { result } = renderHook(() => useNoteContent(vault));
		expect(result.current.ready("a")).toBe(false);

		act(() => result.current.ensure(["a"]));

		await waitFor(() => expect(result.current.ready("a")).toBe(true));
		const note = result.current.hydratedVault.notes.find((n) => n.id === "a");
		expect(note?.content).toBe("Loaded A");
		// untouched note stays empty and not-ready
		expect(result.current.ready("b")).toBe(false);
	});

	it("does not refetch an already-cached chunk", async () => {
		const fetchSpy = vi.fn(async () => ({
			ok: true,
			json: async () => ({ id: "a", content: "X", plainText: "X" }),
		}));
		vi.stubGlobal("fetch", fetchSpy);

		const { result } = renderHook(() => useNoteContent(vault));
		act(() => result.current.ensure(["a"]));
		await waitFor(() => expect(result.current.ready("a")).toBe(true));
		act(() => result.current.ensure(["a"]));
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("treats a failed fetch as empty but loaded (no infinite spinner)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: false, json: async () => null })),
		);
		const { result } = renderHook(() => useNoteContent(vault));
		act(() => result.current.ensure(["a"]));
		await waitFor(() => expect(result.current.ready("a")).toBe(true));
		const note = result.current.hydratedVault.notes.find((n) => n.id === "a");
		expect(note?.content).toBe("");
	});
});
