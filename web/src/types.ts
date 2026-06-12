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

export interface VaultData {
	name: string;
	appVersion?: string;
	notes: Note[];
	tags: string[];
	folders: Folder[];
	edges: Edge[];
	attachments: Record<string, string>; // lowercase-basename → vault-relative-path
}
