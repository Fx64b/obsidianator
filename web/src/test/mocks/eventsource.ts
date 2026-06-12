// Controllable EventSource stand-in for jsdom (which has none). Tests can
// reach created instances via MockEventSource.instances and push events with
// emit() to simulate the --watch live-reload stream.
export class MockEventSource {
	static instances: MockEventSource[] = [];

	url: string;
	readyState = 1;
	onerror: ((ev: Event) => unknown) | null = null;
	private listeners = new Map<string, Set<(e: MessageEvent) => void>>();

	constructor(url: string | URL) {
		this.url = String(url);
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, cb: (e: MessageEvent) => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(cb);
	}

	removeEventListener(type: string, cb: (e: MessageEvent) => void) {
		this.listeners.get(type)?.delete(cb);
	}

	emit(type: string, data: string) {
		for (const cb of this.listeners.get(type) ?? []) {
			cb(new MessageEvent(type, { data }));
		}
	}

	error() {
		this.onerror?.(new Event("error"));
	}

	close() {
		this.readyState = 2;
	}

	static reset() {
		MockEventSource.instances = [];
	}
}
