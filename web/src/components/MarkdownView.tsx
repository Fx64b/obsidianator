import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { sanitizeSchema } from "@/lib/sanitizeSchema";

import {
	AlertCircle,
	AlertTriangle,
	Bug,
	Check,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Clock,
	Code2,
	Copy,
	ExternalLink,
	Hash,
	Info,
	Lightbulb,
	Quote,
} from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { WikilinkPreview } from "@/components/WikilinkPreview";
import { isCalloutSentinel, preprocessContent, slugify } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import type { Note, VaultData } from "@/types";
import "katex/dist/katex.min.css";

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
// MermaidBlock — renders a mermaid diagram from raw code.
//
// `suppressErrorRendering: true` is critical: without it, mermaid inserts its
// bomb / "Syntax error in text" SVG directly into document.body on failure,
// where it persists across navigations and pollutes unrelated notes. With it,
// failures only surface through the promise's catch — our own error UI below.
// ---------------------------------------------------------------------------
function MermaidBlock({ code }: { code: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		let cancelled = false;

		(async () => {
			try {
				const { default: mermaid } = await import("mermaid");
				if (cancelled) return;
				const isDark = document.documentElement.classList.contains("dark");
				mermaid.initialize({
					startOnLoad: false,
					theme: isDark ? "dark" : "default",
					securityLevel: "strict",
					suppressErrorRendering: true,
				});
				const { svg } = await mermaid.render(id, code);
				if (cancelled) return;
				if (ref.current) {
					ref.current.innerHTML = svg;
					setError(null);
				}
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			}
		})();

		return () => {
			cancelled = true;
			// Defensively remove any temp render container mermaid may have left
			// in document.body if it was interrupted mid-render.
			document.getElementById(id)?.remove();
			document.getElementById(`d${id}`)?.remove();
		};
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
			a({
				href,
				id,
				children,
			}: {
				href?: string;
				id?: string;
				children?: React.ReactNode;
			}) {
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
						<WikilinkPreview noteId={noteId} anchor={anchor} vault={vault}>
							<button
								type="button"
								className="wikilink cursor-pointer"
								onClick={() =>
									onSelectNote(noteId, anchor ? `#${anchor}` : undefined)
								}
							>
								{children}
							</button>
						</WikilinkPreview>
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
						// `id` is forwarded so GFM footnote references keep their
						// fnref id and the footnote back-arrow can scroll back to them.
						<a
							href={href}
							id={id}
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
				<ScrollArea type="auto" className="my-4 w-full">
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
		[onSelectNote, onTagClick, vault],
	);

	return (
		<div className="mx-auto min-w-0 max-w-2xl px-4 py-8 sm:px-10 sm:py-12">
			{/* Title */}
			<h1 className="text-2xl font-bold tracking-tight leading-tight break-words sm:text-3xl">
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
					rehypePlugins={[
						rehypeRaw,
						[rehypeSanitize, sanitizeSchema],
						rehypeKatex,
						rehypeHighlight,
					]}
					urlTransform={(url) => url}
					components={components}
				>
					{processed}
				</ReactMarkdown>
			</div>
		</div>
	);
}
