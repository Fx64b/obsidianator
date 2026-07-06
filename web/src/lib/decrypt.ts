// Client-side decryption of a password-protected vault export. Mirrors the
// Go encryptor (internal/export/encrypt.go): PBKDF2-SHA256 → AES-256-GCM with
// a 12-byte IV and the GCM tag appended to the ciphertext.

export interface EncryptedEnvelope {
	encrypted: true;
	kdf: string;
	iterations: number;
	salt: string; // base64
	iv: string; // base64
	ciphertext: string; // base64 (ciphertext || gcm tag)
}

export function isEncryptedEnvelope(x: unknown): x is EncryptedEnvelope {
	return (
		typeof x === "object" &&
		x !== null &&
		(x as { encrypted?: unknown }).encrypted === true
	);
}

// Returns an explicitly ArrayBuffer-backed view so it satisfies Web Crypto's
// BufferSource parameter type under TS's strict typed-array generics.
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
	const bin = atob(b64);
	const buf = new ArrayBuffer(bin.length);
	const bytes = new Uint8Array(buf);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
	const arr = new TextEncoder().encode(s);
	const buf = new ArrayBuffer(arr.length);
	const out = new Uint8Array(buf);
	out.set(arr);
	return out;
}

// Decrypt an envelope with the given password. Throws on a wrong password
// (AES-GCM authentication failure) or malformed input.
export async function decryptEnvelope(
	env: EncryptedEnvelope,
	password: string,
): Promise<unknown> {
	const salt = base64ToBytes(env.salt);
	const iv = base64ToBytes(env.iv);
	const ciphertext = base64ToBytes(env.ciphertext);

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		utf8(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	const key = await crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt,
			iterations: env.iterations,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"],
	);
	const plainBuf = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		ciphertext,
	);
	return JSON.parse(new TextDecoder().decode(plainBuf));
}
