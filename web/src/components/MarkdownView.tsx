import { useState, useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Allow callout sentinel attributes produced by the Go parser, plus elements
// needed by GFM (mark, task-list checkboxes) and syntax highlighting (className).
const sanitizeSchema = {
	...defaultSchema,
	tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
	attributes: {
		...defaultSchema.attributes,
		span: [
			...((defaultSchema.attributes?.span ?? []) as string[]),
			"data-callout",
			"data-callout-title",
			"data-callout-fold",
		],
		mark: [],
		input: ["type", "checked", "disabled"],
	},
};
import mermaid from "mermaid";
import {
	Copy,
	Check,
	Info,
	AlertTriangle,
	AlertCircle,
	Lightbulb,
	CheckCircle,
	Bug,
	Code2,
	Quote,
	ChevronDown,
	ChevronRight,
	Hash,
	Clock,
	ExternalLink,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { PdfViewer } from "@/components/PdfViewer";
import { cn } from "@/lib/utils";
import type { Note, VaultData } from "@/types";
import "katex/dist/katex.min.css";

// ---------------------------------------------------------------------------
// Slugify (mirrors Go slugify)
// ---------------------------------------------------------------------------
function slugify(text: string): string {
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
function findNote(target: string, vault: VaultData): Note | undefined {
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
function makeCalloutSentinel(
	type: string,
	title: string,
	collapsed: boolean,
): string {
	const safeTitle = encodeURIComponent(title);
	const col = collapsed ? "true" : "false";
	return `<span data-callout="${type.toUpperCase()}" data-callout-title="${safeTitle}" data-callout-collapsed="${col}"></span>`;
}

type CalloutSentinelNode = { props: Record<string, string> };

function isCalloutSentinel(node: unknown): node is CalloutSentinelNode {
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
function resolveEmbedsInBody(body: string, vault: VaultData): string {
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
function preprocessContent(content: string, vault: VaultData): string {
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
	out = out.replace(
		/^(>+)\s*\[!(\w+)\](-?)\s*(.*?)$/gm,
		(_, _prefix: string, type: string, collapsed: string, title: string) => {
			const t = title.trim() || type.charAt(0).toUpperCase() + type.slice(1);
			const sentinel = makeCalloutSentinel(type, t, collapsed === "-");
			return `> ${sentinel}`;
		},
	);

	// 5. Wikilinks  [[Target]] [[Target|Alias]] [[Target#Anchor]]
	out = out.replace(
		/\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g,
		(_, target, anchor, alias) => {
			const targetNote = findNote(target.trim(), vault);
			const displayText = alias ?? target.trim();
			if (targetNote) {
				const href = anchor
					? `wiki:${targetNote.id}#${slugify(anchor)}`
					: `wiki:${targetNote.id}`;
				return `[${displayText}](${href})`;
			}
			return `[${displayText}](wiki-missing:${encodeURIComponent(target.trim())})`;
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

// ---------------------------------------------------------------------------
// Callout config
// ---------------------------------------------------------------------------
type CalloutType =
	| "NOTE"
	| "WARNING"
	| "DANGER"
	| "ERROR"
	| "TIP"
	| "HINT"
	| "SUCCESS"
	| "BUG"
	| "EXAMPLE"
	| "QUOTE"
	| "INFO";

const CALLOUT_CONFIG: Record<
	string,
	{ icon: React.ElementType; color: string }
> = {
	NOTE: { icon: Info, color: "cyan" },
	INFO: { icon: Info, color: "cyan" },
	WARNING: { icon: AlertTriangle, color: "amber" },
	DANGER: { icon: AlertCircle, color: "red" },
	ERROR: { icon: AlertCircle, color: "red" },
	TIP: { icon: Lightbulb, color: "emerald" },
	HINT: { icon: Lightbulb, color: "emerald" },
	SUCCESS: { icon: CheckCircle, color: "emerald" },
	BUG: { icon: Bug, color: "red" },
	EXAMPLE: { icon: Code2, color: "blue" },
	QUOTE: { icon: Quote, color: "slate" },
};

const COLOR_CLASSES: Record<
	string,
	{ border: string; bg: string; text: string; iconBg: string }
> = {
	cyan: {
		border: "border-cyan-500/20",
		bg: "bg-cyan-500/10",
		text: "text-cyan-600 dark:text-cyan-400",
		iconBg: "bg-cyan-500",
	},
	amber: {
		border: "border-amber-500/20",
		bg: "bg-amber-500/10",
		text: "text-amber-600 dark:text-amber-400",
		iconBg: "bg-amber-500",
	},
	red: {
		border: "border-red-500/20",
		bg: "bg-red-500/10",
		text: "text-red-600 dark:text-red-400",
		iconBg: "bg-red-500",
	},
	emerald: {
		border: "border-emerald-500/20",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		iconBg: "bg-emerald-500",
	},
	blue: {
		border: "border-blue-500/20",
		bg: "bg-blue-500/10",
		text: "text-blue-600 dark:text-blue-400",
		iconBg: "bg-blue-500",
	},
	slate: {
		border: "border-slate-400/20",
		bg: "bg-slate-500/10",
		text: "text-slate-600 dark:text-slate-300",
		iconBg: "bg-slate-500",
	},
};

// ---------------------------------------------------------------------------
// MermaidBlock — renders a mermaid diagram from raw code
// ---------------------------------------------------------------------------
let mermaidReady = false;

function MermaidBlock({ code }: { code: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const isDark = document.documentElement.classList.contains("dark");
		mermaid.initialize({
			startOnLoad: false,
			theme: isDark ? "dark" : "default",
			securityLevel: "strict",
		});
		mermaidReady = true;

		const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		mermaid
			.render(id, code)
			.then(({ svg }) => {
				if (ref.current) {
					ref.current.innerHTML = svg;
					setError(null);
				}
			})
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : String(err));
			});
		// Re-render when dark mode changes (the class on <html> changes)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [code]);

	if (error) {
		return (
			<div className="my-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400">
				<span className="font-semibold">Mermaid error:</span> {error}
			</div>
		);
	}

	return (
		<div
			ref={ref}
			className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
		/>
	);
}

// Suppress unused warning — mermaidReady is a module-level init guard
void mermaidReady;

// ---------------------------------------------------------------------------
// CodeBlock — shadcn ScrollArea for horizontal scroll
// ---------------------------------------------------------------------------
function CodeBlock({
	className,
	children,
}: {
	className?: string;
	children?: React.ReactNode;
}) {
	const [copied, setCopied] = useState(false);
	const lang = className?.match(/language-(\w+)/)?.[1] ?? "";
	const code = String(children ?? "").replace(/\n$/, "");

	const handleCopy = () => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	};

	return (
		<div className="group my-4 rounded-lg border border-border bg-muted overflow-hidden">
			{/* Header: language label + copy button */}
			<div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
				<span className="font-mono text-[11px] text-muted-foreground">
					{lang || "text"}
				</span>
				<button
					type="button"
					onClick={handleCopy}
					className={cn(
						"flex items-center gap-1 text-[11px] transition-all",
						"opacity-0 group-hover:opacity-100",
						copied
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{copied ? (
						<>
							<Check className="h-3.5 w-3.5" />
							Copied
						</>
					) : (
						<>
							<Copy className="h-3.5 w-3.5" />
							Copy
						</>
					)}
				</button>
			</div>
			{/* Scrollable code area */}
			<ScrollArea type="auto">
				<pre className="code-block-pre">
					<code className={className}>{children}</code>
				</pre>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Callout block component
// ---------------------------------------------------------------------------
function CalloutBlock({
	type,
	title,
	collapsed,
	children,
}: {
	type: string;
	title: string;
	collapsed: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(!collapsed);
	const config = CALLOUT_CONFIG[type as CalloutType] ?? CALLOUT_CONFIG.NOTE;
	const colors = COLOR_CLASSES[config.color] ?? COLOR_CLASSES.slate;
	const Icon = config.icon;
	const ToggleIcon = open ? ChevronDown : ChevronRight;

	return (
		<div
			className={cn(
				"rounded-xl my-4 overflow-hidden border",
				colors.border,
				colors.bg,
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"w-full flex items-center gap-3 px-4 py-3 text-left",
					collapsed ? "cursor-pointer" : "cursor-default",
				)}
				disabled={!collapsed}
			>
				<span
					className={cn(
						"flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
						colors.iconBg,
					)}
				>
					<Icon className="h-3 w-3 text-white" />
				</span>
				<span className={cn("font-semibold text-sm flex-1", colors.text)}>
					{title}
				</span>
				{collapsed && (
					<ToggleIcon className={cn("ml-auto h-4 w-4 shrink-0", colors.text)} />
				)}
			</button>
			{open && (
				<div className="px-4 pb-4 pt-0 text-sm [&_p]:mb-2 [&_p:last-child]:mb-0">
					{children}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main MarkdownView component
// ---------------------------------------------------------------------------
interface MarkdownViewProps {
	note: Note;
	vault: VaultData;
	onSelectNote: (noteId: string, anchor?: string) => void;
	onTagClick?: (tag: string) => void;
}

export function MarkdownView({
	note,
	vault,
	onSelectNote,
	onTagClick,
}: MarkdownViewProps) {
	const processed = useMemo(
		() => preprocessContent(note.content, vault),
		[note.content, vault],
	);
	const [lightbox, setLightbox] = useState<{
		src: string;
		caption: string;
	} | null>(null);

	const formattedDate = note.modified
		? new Date(note.modified).toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			})
		: null;

	const components = useMemo(
		() => ({
			// Headings with anchor IDs
			h1: ({ children }: { children?: React.ReactNode }) => (
				<h1 id={slugify(String(children))}>{children}</h1>
			),
			h2: ({ children }: { children?: React.ReactNode }) => (
				<h2 id={slugify(String(children))}>{children}</h2>
			),
			h3: ({ children }: { children?: React.ReactNode }) => (
				<h3 id={slugify(String(children))}>{children}</h3>
			),
			h4: ({ children }: { children?: React.ReactNode }) => (
				<h4 id={slugify(String(children))}>{children}</h4>
			),
			h5: ({ children }: { children?: React.ReactNode }) => (
				<h5 id={slugify(String(children))}>{children}</h5>
			),
			h6: ({ children }: { children?: React.ReactNode }) => (
				<h6 id={slugify(String(children))}>{children}</h6>
			),

			// Remove the outer <pre> wrapper react-markdown injects around block
			// code — CodeBlock renders its own <pre> internally.
			pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,

			// Code blocks and inline code
			code({
				className,
				children,
				...props
			}: {
				className?: string;
				children?: React.ReactNode;
			}) {
				const lang = className?.match(/language-(\w+)/)?.[1] ?? "";
				const isBlock =
					/\blanguage-\w/.test(className ?? "") ||
					(!className && String(children).includes("\n"));
				if (isBlock) {
					if (lang === "mermaid") {
						return (
							<MermaidBlock code={String(children ?? "").replace(/\n$/, "")} />
						);
					}
					return <CodeBlock className={className}>{children}</CodeBlock>;
				}
				return (
					<code
						className={cn(
							"bg-muted text-foreground rounded px-1.5 py-0.5 text-sm font-mono",
							className,
						)}
						{...props}
					>
						{children}
					</code>
				);
			},

			// Links: wiki: → internal, wiki-missing: → broken, tag: → tag filter, external → new tab
			a({ href, children }: { href?: string; children?: React.ReactNode }) {
				if (href?.startsWith("tag:")) {
					const tag = decodeURIComponent(href.slice(4));
					return (
						<button
							type="button"
							className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-muted-foreground cursor-pointer hover:text-foreground hover:bg-accent/70 transition-colors text-[0.8em]"
							onClick={() => onTagClick?.(tag)}
						>
							{children}
						</button>
					);
				}
				if (href?.startsWith("wiki:")) {
					const rest = href.slice(5);
					const [noteId, anchor] = rest.split("#");
					return (
						<button
							type="button"
							className="wikilink cursor-pointer"
							onClick={() =>
								onSelectNote(noteId, anchor ? `#${anchor}` : undefined)
							}
						>
							{children}
						</button>
					);
				}
				if (href?.startsWith("wiki-missing:")) {
					const title = decodeURIComponent(href.slice(13));
					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="wikilink-missing">{children}</span>
							</TooltipTrigger>
							<TooltipContent>Note not found: {title}</TooltipContent>
						</Tooltip>
					);
				}
				if (href?.startsWith("#")) {
					// Scroll to the heading within the note without changing location.hash
					// (which would be misinterpreted as a note-id navigation).
					const slug = href.slice(1);
					return (
						<a
							href={href}
							onClick={(e) => {
								e.preventDefault();
								document
									.getElementById(slug)
									?.scrollIntoView({ behavior: "smooth", block: "start" });
							}}
							className="text-primary underline underline-offset-2 hover:text-primary/80"
						>
							{children}
						</a>
					);
				}
				return (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-0.5"
					>
						{children}
						<ExternalLink className="h-3 w-3 opacity-50 shrink-0" />
					</a>
				);
			},

			// Images
			img({ src, alt }: { src?: string; alt?: string }) {
				if (src?.startsWith("__PDF_EMBED__")) {
					const path = decodeURIComponent(src.slice("__PDF_EMBED__".length));
					return <PdfViewer src={`./files/${path}`} title={path} />;
				}
				const caption = alt || src?.split("/").pop() || "";
				return (
					<button
						type="button"
						className="p-0 border-0 bg-transparent block cursor-zoom-in"
						onClick={() => src && setLightbox({ src, caption })}
					>
						<img
							src={src}
							alt={alt ?? ""}
							className="max-w-full rounded-lg my-4"
							loading="lazy"
						/>
					</button>
				);
			},

			// Blockquotes: detect callout sentinel span, else plain blockquote
			blockquote({ children }: { children?: React.ReactNode }) {
				const childArray = Array.isArray(children) ? children : [children];
				const firstPara = childArray.find(
					(c): c is React.ReactElement =>
						c !== null &&
						typeof c === "object" &&
						"type" in c &&
						(c as React.ReactElement).type === "p",
				);

				if (firstPara) {
					const paraChildren = Array.isArray(firstPara.props.children)
						? firstPara.props.children
						: [firstPara.props.children];

					const sentinel = paraChildren[0];
					if (isCalloutSentinel(sentinel)) {
						const type = sentinel.props["data-callout"] ?? "";
						const title = decodeURIComponent(
							sentinel.props["data-callout-title"] ?? type,
						);
						const collapsed =
							sentinel.props["data-callout-collapsed"] === "true";
						const bodyChildren = childArray.slice(
							childArray.indexOf(firstPara) + 1,
						);
						const inlineRest = paraChildren.slice(1);
						return (
							<CalloutBlock type={type} title={title} collapsed={collapsed}>
								{inlineRest.length > 0 && <p>{inlineRest}</p>}
								{bodyChildren}
							</CalloutBlock>
						);
					}
				}

				return (
					<blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground my-4 [&_p]:mb-1">
						{children}
					</blockquote>
				);
			},

			// Table with horizontal scroll
			table: ({ children }: { children?: React.ReactNode }) => (
				<ScrollArea className="my-4 w-full">
					<table className="border-collapse text-sm">{children}</table>
					<ScrollBar orientation="horizontal" />
				</ScrollArea>
			),
			th: ({ children }: { children?: React.ReactNode }) => (
				<th className="border border-border bg-muted px-3 py-2 text-left font-semibold">
					{children}
				</th>
			),
			td: ({ children }: { children?: React.ReactNode }) => (
				<td className="border border-border px-3 py-2">{children}</td>
			),
		}),
		[onSelectNote, onTagClick],
	);

	return (
		<div className="mx-auto max-w-2xl px-4 py-8 sm:px-10 sm:py-12">
			{/* Title */}
			<h1 className="text-3xl font-bold tracking-tight leading-tight">
				{note.title}
			</h1>

			{/* Meta */}
			{(formattedDate || note.folder || note.tags.length > 0) && (
				<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					{note.folder && <span>{note.folder}</span>}
					{formattedDate && (
						<>
							{note.folder && <span className="text-border">·</span>}
							<span className="flex items-center gap-1">
								<Clock className="h-3 w-3" />
								{formattedDate}
							</span>
						</>
					)}
					{note.tags.length > 0 && (
						<>
							{(note.folder || formattedDate) && (
								<span className="text-border">·</span>
							)}
							<div className="flex flex-wrap gap-1.5">
								{note.tags.map((tag) => (
									<button
										type="button"
										key={tag}
										onClick={() => onTagClick?.(tag)}
										className="flex items-center gap-0.5 rounded px-1 py-0.5 -mx-1 -my-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors"
									>
										<Hash className="h-2.5 w-2.5 shrink-0" />
										{tag}
									</button>
								))}
							</div>
						</>
					)}
				</div>
			)}

			{/* Divider */}
			<div className="mt-6 border-t border-border" />

			{/* Image lightbox */}
			<Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
				<DialogContent
					className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] max-h-[90vh] p-0 overflow-hidden gap-0"
					showCloseButton={false}
				>
					<DialogTitle className="sr-only">{lightbox?.caption}</DialogTitle>
					{lightbox && (
						<>
							<img
								src={lightbox.src}
								alt={lightbox.caption}
								className="block w-full max-h-[calc(90vh-2.75rem)] object-contain"
							/>
							{lightbox.caption && (
								<DialogDescription className="px-4 py-2.5 text-center text-xs text-muted-foreground border-t border-border">
									{lightbox.caption}
								</DialogDescription>
							)}
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* Content */}
			<div className="markdown-body mt-6">
				<ReactMarkdown
					remarkPlugins={[remarkGfm, remarkMath]}
					rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex, rehypeHighlight]}
					urlTransform={(url) => url}
					components={components}
				>
					{processed}
				</ReactMarkdown>
			</div>
		</div>
	);
}
