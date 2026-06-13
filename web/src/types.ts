export interface Header {
	level: number;
	text: string;
	slug: string;
}

export interface Note {
	id: string;
	title: string;
	aliases: string[];
	path: string;
	content: string;
	plainText: string;
	tags: string[];
	links: string[];
	backlinks: string[];
	frontmatter: Record<string, unknown>;
	headers: Header[];
	folder: string;
	modified: string;
	created: string;
}

export interface Edge {
	source: string;
	target: string;
}

export interface Folder {
	name: string;
	path: string;
	parent: string;
	children: string[];
	notes: string[];
}

export interface CanvasNode {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text?: string;
	file?: string;
	subpath?: string;
	noteId?: string;
	url?: string;
	label?: string;
	background?: string;
	backgroundStyle?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: "top" | "right" | "bottom" | "left";
	fromEnd?: "none" | "arrow";
	toNode: string;
	toSide?: "top" | "right" | "bottom" | "left";
	toEnd?: "none" | "arrow";
	color?: string;
	label?: string;
}

export interface Canvas {
	id: string;
	name: string;
	path: string;
	folder: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface VaultData {
	name: string;
	appVersion?: string;
	notes: Note[];
	tags: string[];
	folders: Folder[];
	edges: Edge[];
	attachments: Record<string, string>; // lowercase-basename → vault-relative-path
	canvases: Canvas[];
}
