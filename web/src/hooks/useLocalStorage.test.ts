import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "@/hooks/useLocalStorage";

describe("useLocalStorage", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("returns the initial value when nothing is stored", () => {
		const { result } = renderHook(() => useLocalStorage("key", "fallback"));
		expect(result.current[0]).toBe("fallback");
	});

	it("reads an existing stored value", () => {
		window.localStorage.setItem("key", JSON.stringify("stored"));
		const { result } = renderHook(() => useLocalStorage("key", "fallback"));
		expect(result.current[0]).toBe("stored");
	});

	it("persists updates to localStorage", () => {
		const { result } = renderHook(() => useLocalStorage("key", 1));
		act(() => result.current[1](42));
		expect(result.current[0]).toBe(42);
		expect(window.localStorage.getItem("key")).toBe("42");
	});

	it("supports functional updates", () => {
		const { result } = renderHook(() => useLocalStorage("count", 10));
		act(() => result.current[1]((prev) => prev + 5));
		expect(result.current[0]).toBe(15);
	});

	it("handles complex values", () => {
		const { result } = renderHook(() =>
			useLocalStorage<{ a: string[] }>("obj", { a: [] }),
		);
		act(() => result.current[1]({ a: ["x", "y"] }));
		expect(JSON.parse(window.localStorage.getItem("obj") ?? "")).toEqual({
			a: ["x", "y"],
		});
	});

	it("falls back to the initial value on corrupt JSON", () => {
		window.localStorage.setItem("key", "{not json");
		const { result } = renderHook(() => useLocalStorage("key", "fallback"));
		expect(result.current[0]).toBe("fallback");
	});
});
