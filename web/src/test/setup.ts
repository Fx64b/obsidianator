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
