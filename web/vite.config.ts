import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "../static",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				// Collapse all of mermaid's internal chunks (dagre, sequence,
				// flowchart, etc.) into a single chunk. Mermaid normally splits
				// each diagram type into its own dynamically-imported sub-chunk;
				// any one of those failing to load (transient network, aborted
				// fetch from a remount) breaks that diagram type for the rest of
				// the session because the browser caches failed module promises.
				manualChunks(id) {
					if (id.includes("node_modules/mermaid")) return "mermaid";
				},
			},
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
		css: false,
	},
});
