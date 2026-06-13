import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useEnsureContent } from "@/hooks/useNoteContent";
import {
	extractBlock,
	extractSection,
	preprocessContent,
	stripFrontmatter,
} from "@/lib/markdown";
import { sanitizeSchema } from "@/lib/sanitizeSchema";
import type { Note, VaultData } from "@/types";

const PREVIEW_CHAR_LIMIT = 1200;

// Cut markdown at a paragraph boundary near the limit so the preview never
// ends mid-sentence or mid-construct.
function truncateBlocks(md: string, limit = PREVIEW_CHAR_LIMIT): string {
	if (md.length <= limit) return md;
	const blocks = md.split(/\n\n+/);
	let out = "";
	for (const block of blocks) {
		if (out && out.length + block.length > limit) return `${out}\n\n…`;
		out = out ? `${out}\n\n${block}` : block;
	}
	return out;
}

// Inert renderers: previews are read-only, so links lose their handlers and
// nothing heavy (PDF viewer, mermaid, lightbox) mounts inside the card.
const previewComponents = {
	a({ href, children }: { href?: string; children?: React.ReactNode }) {
		if (href?.startsWith("wiki:") || href?.startsWith("#")) {
			return <span className="wikilink">{children}</span>;
		}
		if (href?.startsWith("wiki-missing:")) {
			return <span className="wikilink-missing">{children}</span>;
		}
		if (href?.startsWith("tag:")) {
			return (
				<span className="text-muted-foreground text-[0.8em]">{children}</span>
			);
		}
		return (
			<span className="text-primary underline underline-offset-2">
				{children}
			</span>
		);
	},
	// Drop block-anchor ids so an open preview can't shadow the ids in the
	// actual note when anchor links resolve via document.getElementById.
	span({
		id: _id,
		node: _node,
		...props
	}: { id?: string; node?: unknown } & React.HTMLAttributes<HTMLSpanElement>) {
		return <span {...props} />;
	},
	img({ src, alt }: { src?: string; alt?: string }) {
		if (src?.startsWith("__PDF_EMBED__")) {
			return (
				<span className="text-xs italic text-muted-foreground">
					PDF: {decodeURIComponent(src.slice("__PDF_EMBED__".length))}
				</span>
			);
		}
		return (
			<img
				src={src}
				alt={alt ?? ""}
				className="my-2 max-w-full rounded"
				loading="lazy"
			/>
		);
	},
	pre({ children }: { children?: React.ReactNode }) {
		return (
			<pre className="my-2 overflow-x-auto rounded bg-muted p-2 text-xs">
				{children}
			</pre>
		);
	},
};

interface NotePreviewBodyProps {
	note: Note;
	// Slugified anchor (no leading '#'): a heading slug or a block id.
	anchor?: string;
	vault: VaultData;
}

// Exported separately so tests can render the preview content without going
// through radix hover interactions.
export function NotePreviewBody({ note, anchor, vault }: NotePreviewBodyProps) {
	const { ensure, ready } = useEnsureContent();
	// In chunked mode the preview target's content may not be loaded yet;
	// request it on open and show a loading line until it arrives.
	useEffect(() => {
		ensure([note.id]);
	}, [ensure, note.id]);
	const loaded = ready(note.id);

	const processed = useMemo(() => {
		let body: string | null = null;
		if (anchor) {
			body =
				extractSection(note.content, anchor) ??
				extractBlock(note.content, anchor);
		}
		if (body === null) body = stripFrontmatter(note.content).trim();
		return preprocessContent(truncateBlocks(body), vault);
	}, [note, anchor, vault]);

	return (
		<div>
			<div className="border-b border-border px-3 py-2">
				<div className="text-sm font-semibold leading-tight">{note.title}</div>
				{note.folder && (
					<div className="text-[11px] text-muted-foreground">{note.folder}</div>
				)}
			</div>
			<div className="max-h-64 overflow-y-auto px-3 py-2">
				{!loaded ? (
					<p className="text-xs italic text-muted-foreground">Loading…</p>
				) : processed.trim() ? (
					<div className="markdown-body">
						<ReactMarkdown
							remarkPlugins={[remarkGfm, remarkMath]}
							rehypePlugins={[
								rehypeRaw,
								[rehypeSanitize, sanitizeSchema],
								rehypeKatex,
								rehypeHighlight,
							]}
							urlTransform={(url) => url}
							components={previewComponents}
						>
							{processed}
						</ReactMarkdown>
					</div>
				) : (
					<p className="text-xs italic text-muted-foreground">Empty note</p>
				)}
			</div>
		</div>
	);
}

interface WikilinkPreviewProps {
	noteId: string;
	anchor?: string;
	vault: VaultData;
	children: React.ReactElement;
}

// Wraps a wikilink trigger element with a hover-card preview of the target
// note. When the link carries an anchor, the preview shows just that section
// or block, mirroring what navigation would scroll to.
export function WikilinkPreview({
	noteId,
	anchor,
	vault,
	children,
}: WikilinkPreviewProps) {
	const note = vault.notes.find((n) => n.id === noteId);
	if (!note) return children;
	return (
		<HoverCard openDelay={400} closeDelay={100}>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent
				side="top"
				align="start"
				sideOffset={6}
				className="note-preview w-80 overflow-hidden p-0"
			>
				<NotePreviewBody note={note} anchor={anchor} vault={vault} />
			</HoverCardContent>
		</HoverCard>
	);
}
