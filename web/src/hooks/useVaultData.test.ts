import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVaultData } from "@/hooks/useVaultData";
import { MockEventSource } from "@/test/mocks/eventsource";

// A raw payload with missing/null fields, as a defensive-normalization case.
const rawVault = {
	name: "test",
	notes: [
		{
			id: "a",
			title: "A",
			path: "A.md",
			content: "# A",
			folder: "",
			modified: "2024-01-01T00:00:00Z",
			created: "2024-01-01T00:00:00Z",
			// aliases/plainText/tags/links/backlinks/headers/frontmatter omitted
		},
	],
	// tags/edges/attachments/folders omitted
};

function stubFetch(response: () => Promise<Response>) {
	const fn = vi.fn(response);
	vi.stubGlobal("fetch", fn);
	return fn;
}

afterEach(() => {
	vi.unstubAllGlobals();
	// setup.ts re-stubs EventSource per file; restore it after unstubAllGlobals
	vi.stubGlobal("EventSource", MockEventSource);
});

describe("useVaultData", () => {
	it("fetches and normalizes vault-data.json", async () => {
		stubFetch(async () => new Response(JSON.stringify(rawVault)));
		const { result } = renderHook(() => useVaultData());

		expect(result.current.loading).toBe(true);
		await waitFor(() => expect(result.current.loading).toBe(false));

		const vault = result.current.vault;
		expect(result.current.error).toBeNull();
		expect(vault?.name).toBe("test");
		// nulls/missing fields normalized to safe empties
		expect(vault?.notes[0].aliases).toEqual([]);
		expect(vault?.notes[0].tags).toEqual([]);
		expect(vault?.notes[0].backlinks).toEqual([]);
		expect(vault?.notes[0].frontmatter).toEqual({});
		expect(vault?.tags).toEqual([]);
		expect(vault?.edges).toEqual([]);
		expect(vault?.folders).toEqual([]);
		expect(vault?.attachments).toEqual({});
	});

	it("reports HTTP errors", async () => {
		stubFetch(async () => new Response("nope", { status: 404 }));
		const { result } = renderHook(() => useVaultData());
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBe("HTTP 404");
		expect(result.current.vault).toBeNull();
	});

	it("reports network failures", async () => {
		stubFetch(async () => {
			throw new Error("connection refused");
		});
		const { result } = renderHook(() => useVaultData());
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBe("connection refused");
	});

	it("refetches when the live-reload SSE stream emits", async () => {
		const fetchFn = stubFetch(
			async () => new Response(JSON.stringify(rawVault)),
		);
		const { result } = renderHook(() => useVaultData());
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetchFn).toHaveBeenCalledTimes(1);

		const es = MockEventSource.instances.at(-1);
		expect(es?.url).toContain("reload");
		es?.emit("message", "reload");

		await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
	});

	it("ignores non-reload SSE messages", async () => {
		const fetchFn = stubFetch(
			async () => new Response(JSON.stringify(rawVault)),
		);
		const { result } = renderHook(() => useVaultData());
		await waitFor(() => expect(result.current.loading).toBe(false));

		MockEventSource.instances.at(-1)?.emit("message", "connected");
		// give any wrongly-triggered refetch a tick to fire
		await new Promise((r) => setTimeout(r, 20));
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("closes the SSE connection on unmount", async () => {
		stubFetch(async () => new Response(JSON.stringify(rawVault)));
		const { result, unmount } = renderHook(() => useVaultData());
		await waitFor(() => expect(result.current.loading).toBe(false));
		const es = MockEventSource.instances.at(-1);
		unmount();
		expect(es?.readyState).toBe(2); // CLOSED
	});
});
