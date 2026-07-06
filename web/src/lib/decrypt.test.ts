import { describe, expect, it } from "vitest";
import {
	decryptEnvelope,
	type EncryptedEnvelope,
	isEncryptedEnvelope,
} from "@/lib/decrypt";

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

// Build an envelope the same way the Go exporter does (PBKDF2-SHA256 →
// AES-256-GCM, 12-byte IV, tag appended), so decryptEnvelope is exercised
// against the exact on-disk layout.
async function makeEnvelope(
	plaintext: string,
	password: string,
	iterations = 1000,
): Promise<EncryptedEnvelope> {
	const enc = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	const key = await crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations, hash: "SHA-256" },
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			enc.encode(plaintext),
		),
	);
	return {
		encrypted: true,
		kdf: "pbkdf2-sha256",
		iterations,
		salt: bytesToBase64(salt),
		iv: bytesToBase64(iv),
		ciphertext: bytesToBase64(ct),
	};
}

describe("isEncryptedEnvelope", () => {
	it("recognises an envelope and rejects plaintext", () => {
		expect(isEncryptedEnvelope({ encrypted: true })).toBe(true);
		expect(isEncryptedEnvelope({ name: "vault", notes: [] })).toBe(false);
		expect(isEncryptedEnvelope(null)).toBe(false);
	});
});

describe("decryptEnvelope", () => {
	it("decrypts a correct password back to the original JSON", async () => {
		const env = await makeEnvelope('{"name":"secret","notes":[]}', "pw");
		const result = await decryptEnvelope(env, "pw");
		expect(result).toEqual({ name: "secret", notes: [] });
	});

	it("throws on the wrong password", async () => {
		const env = await makeEnvelope('{"x":1}', "right");
		await expect(decryptEnvelope(env, "wrong")).rejects.toBeTruthy();
	});
});
