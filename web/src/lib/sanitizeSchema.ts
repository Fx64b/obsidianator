import { defaultSchema } from "rehype-sanitize";

// Allow callout sentinel attributes produced by the Go parser, plus elements
// needed by GFM (mark, task-list checkboxes), syntax highlighting (className),
// and block-reference anchors (span id / data-block-anchor emitted by
// preprocessContent for Obsidian ^block-id markers).
// `clobberPrefix: ""` disables the default `user-content-` prefix — remark-gfm
// already emits footnote ids with that prefix, and re-prefixing would break the
// matching `#user-content-fn-N` hrefs.
export const sanitizeSchema = {
	...defaultSchema,
	clobberPrefix: "",
	tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
	protocols: {
		...defaultSchema.protocols,
		href: [
			...((defaultSchema.protocols?.href ?? []) as string[]),
			"wiki",
			"wiki-missing",
			"tag",
		],
	},
	attributes: {
		...defaultSchema.attributes,
		// hast-util-sanitize matches camelCase *property* names, not HTML
		// attribute names: data-callout → dataCallout, class → className.
		span: [
			...((defaultSchema.attributes?.span ?? []) as string[]),
			"dataCallout",
			"dataCalloutTitle",
			"dataCalloutCollapsed",
			"dataBlockAnchor",
			"id",
			[
				"className",
				"cb-state",
				"cb-progress",
				"cb-cancelled",
				"cb-important",
				"cb-question",
				"cb-star",
				"cb-forward",
			],
		],
		mark: [],
		input: ["type", "checked", "disabled"],
	},
};
