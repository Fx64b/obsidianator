import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Note, VaultData } from "@/types";

const SKIP_FIELDS = new Set([
	"tags",
	"aliases",
	"title",
	"cssclass",
	"banner",
	"publish",
]);

function formatFieldName(key: string): string {
	return key.replace(/[_-]/g, " ").toLowerCase();
}

function isDateString(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s);
}

function isUrl(s: string): boolean {
	return /^https?:\/\//.test(s);
}

function truncateDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

interface FieldValueProps {
	value: unknown;
	vault: VaultData;
	onSelectNote: (noteId: string) => void;
}

function FieldValue({ value, vault, onSelectNote }: FieldValueProps) {
	if (typeof value === "boolean") {
		return value ? (
			<Badge
				variant="default"
				className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
			>
				Yes
			</Badge>
		) : (
			<Badge variant="secondary" className="text-xs">
				No
			</Badge>
		);
	}

	if (typeof value === "number") {
		return <span className="text-sm">{value}</span>;
	}

	if (typeof value === "string") {
		// Date
		if (isDateString(value)) {
			const date = new Date(value);
			return (
				<span className="text-sm text-muted-foreground">
					{date.toLocaleDateString(undefined, {
						year: "numeric",
						month: "short",
						day: "numeric",
					})}
				</span>
			);
		}

		// URL
		if (isUrl(value)) {
			return (
				<a
					href={value}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
				>
					<ExternalLink className="h-3 w-3" />
					{truncateDomain(value)}
				</a>
			);
		}

		// Note link (exact title match)
		const matchedNote = vault.notes.find(
			(n) => n.title.toLowerCase() === value.toLowerCase(),
		);
		if (matchedNote) {
			return (
				<button
					type="button"
					onClick={() => onSelectNote(matchedNote.id)}
					className="text-sm text-primary hover:underline text-left"
				>
					{value}
				</button>
			);
		}

		return <span className="text-sm break-words">{value}</span>;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) return null;
		return (
			<div className="flex flex-wrap gap-1">
				{value.map((item, i) => {
					if (typeof item === "string") {
						const matchedNote = vault.notes.find(
							(n) => n.title.toLowerCase() === item.toLowerCase(),
						);
						if (matchedNote) {
							return (
								<Badge
									key={i}
									variant="secondary"
									className="text-xs cursor-pointer hover:bg-accent"
									onClick={() => onSelectNote(matchedNote.id)}
								>
									{item}
								</Badge>
							);
						}
						return (
							<Badge key={i} variant="secondary" className="text-xs">
								{item}
							</Badge>
						);
					}
					return (
						<Badge key={i} variant="secondary" className="text-xs">
							{String(item)}
						</Badge>
					);
				})}
			</div>
		);
	}

	return (
		<span className="text-sm text-muted-foreground">
			{JSON.stringify(value)}
		</span>
	);
}

interface FrontmatterPanelProps {
	note: Note;
	vault: VaultData;
	onSelectNote: (noteId: string) => void;
}

export function FrontmatterPanel({
	note,
	vault,
	onSelectNote,
}: FrontmatterPanelProps) {
	const entries = Object.entries(note.frontmatter).filter(
		([key]) => !SKIP_FIELDS.has(key),
	);

	if (entries.length === 0) {
		return (
			<p className="text-xs text-muted-foreground px-3 py-2 italic">
				No properties
			</p>
		);
	}

	return (
		<div className="space-y-2 px-3 py-2">
			{entries.map(([key, value]) => (
				<div key={key}>
					<p className="text-xs font-medium text-muted-foreground mb-0.5 capitalize">
						{formatFieldName(key)}
					</p>
					<FieldValue value={value} vault={vault} onSelectNote={onSelectNote} />
				</div>
			))}
		</div>
	);
}
