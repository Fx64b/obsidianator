import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { MockEventSource } from "./mocks/eventsource";

afterEach(() => {
	cleanup();
	MockEventSource.reset();
});

// ── jsdom gaps ────────────────────────────────────────────────────────────────

vi.stubGlobal("EventSource", MockEventSource);

if (!window.matchMedia) {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}

if (!window.ResizeObserver) {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

// jsdom 29 exposes `window.localStorage` as an empty object with no Storage
// methods, so any hook that reads/writes it throws. Back it with a real Map.
if (typeof window.localStorage?.setItem !== "function") {
	const store = new Map<string, string>();
	const storage: Storage = {
		getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
		setItem: (key, value) => {
			store.set(key, String(value));
		},
		removeItem: (key) => {
			store.delete(key);
		},
		clear: () => {
			store.clear();
		},
		key: (index) => [...store.keys()][index] ?? null,
		get length() {
			return store.size;
		},
	};
	Object.defineProperty(window, "localStorage", {
		value: storage,
		configurable: true,
	});
}

Element.prototype.scrollIntoView ??= () => {};
// Radix UI pointer-capture calls not implemented by jsdom
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

if (typeof CSS === "undefined" || !CSS.escape) {
	vi.stubGlobal("CSS", {
		...(typeof CSS !== "undefined" ? CSS : {}),
		escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
	});
}
