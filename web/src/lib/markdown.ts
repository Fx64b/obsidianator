import type { Note, VaultData } from "@/types";

// ---------------------------------------------------------------------------
// Slugify (mirrors Go slugify)
// ---------------------------------------------------------------------------
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// 4-tier note lookup: title (exact) → title (case-insensitive) → alias → slug
// Mirrors Go resolveLinks, extended with alias resolution.
// ---------------------------------------------------------------------------
export function findNote(target: string, vault: VaultData): Note | undefined {
	const t = target.trim();
	let note = vault.notes.find((n) => n.title === t);
	if (note) return note;
	const lower = t.toLowerCase();
	note = vault.notes.find((n) => n.title.toLowerCase() === lower);
	if (note) return note;
	// Alias match (case-insensitive)
	note = vault.notes.find((n) =>
		n.aliases.some((a) => a.toLowerCase() === lower),
	);
	if (note) return note;
	const slug = t
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
	note = vault.notes.find((n) => n.id.endsWith(slug));
	return note;
}

// ---------------------------------------------------------------------------
// Callout sentinel helpers
// Callouts are emitted as an invisible <span data-callout="TYPE" ...> so that
// the title and collapsed state are carried as HTML attributes — immune to
// markdown re-interpretation — and the body lines follow naturally.
// ---------------------------------------------------------------------------
export function makeCalloutSentinel(
	type: string,
	title: string,
	collapsed: boolean,
): string {
	const safeTitle = encodeURIComponent(title);
	const col = collapsed ? "true" : "false";
	return `<span data-callout="${type.toUpperCase()}" data-callout-title="${safeTitle}" data-callout-collapsed="${col}"></span>`;
}

export type CalloutSentinelNode = { props: Record<string, string> };

export function isCalloutSentinel(node: unknown): node is CalloutSentinelNode {
	if (node === null || typeof node !== "object") return false;
	const n = node as Record<string, unknown>;
	if (n.type !== "span") return false;
	const props = n.props;
	if (!props || typeof props !== "object") return false;
	return Boolean((props as Record<string, unknown>)["data-callout"]);
}

// ---------------------------------------------------------------------------
// Resolve image/PDF embeds inside a transcluded note's body so that
// ![[image.png]] inside an embedded note renders correctly in the parent.
// ---------------------------------------------------------------------------
export function resolveEmbedsInBody(body: string, vault: VaultData): string {
	return body.replace(/!\[\[([^\]]+?)\]\]/g, (_, inner) => {
		const parts = inner.split("|");
		const name = parts[0].trim();
		const ext = name.split(".").pop()?.toLowerCase() ?? "";
		if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
			const src = vault.attachments[name.toLowerCase()]
				? `./files/${vault.attachments[name.toLowerCase()]}`
				: name;
			return `![${name}](${src})`;
		}
		if (ext === "pdf") {
			const vaultPath = vault.attachments[name.toLowerCase()] ?? name;
			return `![${name}](__PDF_EMBED__${vaultPath.replace(/ /g, "%20")})`;
		}
		return `\`![[${name}]]\``;
	});
}

// ---------------------------------------------------------------------------
// Preprocessing pipeline
// ---------------------------------------------------------------------------
export function preprocessContent(content: string, vault: VaultData): string {
	// 1. Strip frontmatter
	let out = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

	// 2. Protect regular fenced code blocks AND convert ad-* admonitions.
	//    Both are handled in one pass so that ad-* blocks are never accidentally
	//    treated as regular code blocks (which would protect them before step 3).
	const codeBlocks: string[] = [];
	out = out.replace(
		/^(`{3,})([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm,
		(match, _fence: string, langLine: string, body: string) => {
			const adMatch = /^ad-(\w+)/i.exec(langLine.trim());
			if (adMatch) {
				const type = adMatch[1];
				const lines = body.split(/\r?\n/);
				let title = type.charAt(0).toUpperCase() + type.slice(1);
				const bodyLines: string[] = [];
				let parsingTitle = true;
				for (const line of lines) {
					const trimmed = line.trimEnd();
					if (parsingTitle && /^title:\s*/i.test(trimmed)) {
						title = trimmed.replace(/^title:\s*/i, "");
						parsingTitle = false;
						continue;
					}
					parsingTitle = false;
					if (trimmed) bodyLines.push(`> ${trimmed}`);
				}
				const sentinel = makeCalloutSentinel(type, title, false);
				return `> ${sentinel}\n>\n${bodyLines.join("\n")}\n`;
			}
			const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
			codeBlocks.push(match);
			return placeholder;
		},
	);

	// 3. Embed blocks  ![[...]]
	out = out.replace(/!\[\[([^\]]+?)\]\]/g, (_, inner) => {
		const parts = inner.split("|");
		const name = parts[0].trim();
		const sizePart = parts[1]?.trim() ?? "";
		const ext = name.split(".").pop()?.toLowerCase() ?? "";

		// Parse optional size modifier: "200" or "200x300"
		let imgWidth = "";
		let imgHeight = "";
		if (sizePart && /^\d+(?:x\d+)?$/.test(sizePart)) {
			const [w, h] = sizePart.split("x");
			imgWidth = w;
			imgHeight = h ?? "";
		}

		if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
			const key = name.toLowerCase();
			const vaultPath = vault.attachments[key];
			const src = vaultPath ? `./files/${vaultPath}` : name;
			if (imgWidth) {
				const heightAttr = imgHeight ? ` height="${imgHeight}"` : "";
				return `<img src="${src}" alt="${name}" width="${imgWidth}"${heightAttr} />`;
			}
			return `![${name}](${src})`;
		}

		if (ext === "pdf") {
			const key = name.toLowerCase();
			const vaultPath = vault.attachments[key] ?? name;
			// Encode the path so spaces don't break markdown image parsing
			const encodedPath = vaultPath.replace(/ /g, "%20");
			return `![${name}](__PDF_EMBED__${encodedPath})`;
		}

		if (ext === "md" || !ext || !name.includes(".")) {
			const targetName = name.replace(/\.md$/, "");
			const targetNote = findNote(targetName, vault);
			if (targetNote) {
				const rawBody = targetNote.content
					.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
					.trim();
				// Resolve image/PDF embeds inside the transcluded note before quoting
				const body = resolveEmbedsInBody(rawBody, vault);
				const quoted = body
					.split("\n")
					.map((line) => `> ${line}`)
					.join("\n");
				return `${quoted}\n> \n> — *[[${targetNote.title}]]*\n`;
			}
		}

		return `\`![[${name}]]\``;
	});

	// 4. Obsidian callouts  > [!TYPE] Title  and  > [!TYPE]- Title (collapsed)
	//    The sentinel span carries type/title/collapsed as HTML attributes.
	//    No paragraph-separator tricks needed — the title lives in the attribute.
	// [ \t]* (not \s*) so a title-less callout marker never swallows the
	// newline and absorbs the first body line as its title.
	out = out.replace(
		/^(>+)[ \t]*\[!(\w+)\](-?)[ \t]*(.*?)$/gm,
		(_, _prefix: string, type: string, collapsed: string, title: string) => {
			const t = title.trim() || type.charAt(0).toUpperCase() + type.slice(1);
			const sentinel = makeCalloutSentinel(type, t, collapsed === "-");
			return `> ${sentinel}`;
		},
	);

	// 5. Wikilinks  [[Target]] [[Target|Alias]] [[Target#Anchor]] [[#Anchor]]
	out = out.replace(
		/\[\[([^\]|#]*?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g,
		(match, target, anchor, alias) => {
			const t = target.trim();
			// Same-note header link: [[#Anchor]] points at a heading in the
			// current note, so emit a plain #-anchor handled by the link renderer.
			if (!t) {
				if (!anchor) return match; // malformed [[]] — leave untouched
				const displayText = alias ?? anchor.trim();
				return `[${displayText}](#${slugify(anchor)})`;
			}
			const targetNote = findNote(t, vault);
			const displayText = alias ?? t;
			if (targetNote) {
				const href = anchor
					? `wiki:${targetNote.id}#${slugify(anchor)}`
					: `wiki:${targetNote.id}`;
				return `[${displayText}](${href})`;
			}
			return `[${displayText}](wiki-missing:${encodeURIComponent(t)})`;
		},
	);

	// 6. Inline tags  #tag  →  [#tag](tag:tag)
	out = out.replace(
		/(^|[ \t])#([a-zA-Z][a-zA-Z0-9_/-]*)/gm,
		(_, prefix, tag) => {
			return `${prefix}[#${tag}](tag:${encodeURIComponent(tag)})`;
		},
	);

	// 7. Inline footnotes  ^[text]
	let fnCount = 0;
	const fnDefs: string[] = [];
	out = out.replace(/\^\[([^\]]+)\]/g, (_, text) => {
		const label = `fn-inline-${fnCount++}`;
		fnDefs.push(`[^${label}]: ${text}`);
		return `[^${label}]`;
	});
	if (fnDefs.length > 0) {
		out += `\n\n${fnDefs.join("\n")}`;
	}

	// 8. Obsidian highlight  ==text==  →  <mark>text</mark>
	out = out.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");

	// 9. Superscript  ^text^  (skip footnote refs [^…] and inline ^[…])
	out = out.replace(/(?<!\[)\^([^^\n[\]]+)\^/g, "<sup>$1</sup>");

	// 10. Subscript  ~text~  (skip ~~strikethrough~~)
	out = out.replace(/(?<!~)~(?!~)([^~\n]+?)~(?!~)/g, "<sub>$1</sub>");

	// 11. Custom checkbox states  - [-]  - [/]  - [!]  - [?]  - [*]
	out = out.replace(/^(\s*[-*+] )\[([/\-!?*>])\] /gm, (_, prefix, state) => {
		const icons: Record<string, string> = {
			"/": '<span class="cb-state cb-progress" title="In progress">⊘</span> ',
			"-": '<span class="cb-state cb-cancelled" title="Cancelled">✗</span> ',
			"!": '<span class="cb-state cb-important" title="Important">‼</span> ',
			"?": '<span class="cb-state cb-question" title="Question">?</span> ',
			"*": '<span class="cb-state cb-star" title="Star">★</span> ',
			">": '<span class="cb-state cb-forward" title="Forwarded">→</span> ',
		};
		return `${prefix}${icons[state] ?? `[${state}] `}`;
	});

	// Restore fenced code blocks
	out = out.replace(
		/__CODEBLOCK_(\d+)__/g,
		(_, i) => codeBlocks[parseInt(i, 10)],
	);

	return out;
}
