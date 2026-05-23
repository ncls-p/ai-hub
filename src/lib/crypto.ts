import { env } from "./env";

const ALGO = "AES-GCM";
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
let cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;

	const keyBuffer = Buffer.from(env.APP_ENCRYPTION_KEY, "hex");
	cachedKey = await crypto.subtle.importKey(
		"raw",
		keyBuffer,
		{ name: ALGO },
		false,
		["encrypt", "decrypt"],
	);
	return cachedKey;
}

async function deriveKey(
	password: string,
	salt: Uint8Array,
): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt.buffer as ArrayBuffer,
			iterations: 100_000,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: ALGO, length: 256 },
		true,
		["encrypt", "decrypt"],
	);
}

/**
 * Encrypt a string value. Returns { ciphertext, iv, salt, keyId } as a JSON string.
 */
export async function encryptValue(plaintext: string): Promise<string> {
	const key = await getEncryptionKey();
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

	const ciphertext = await crypto.subtle.encrypt(
		{ name: ALGO, iv },
		key,
		new TextEncoder().encode(plaintext),
	);

	const payload = {
		ct: Buffer.from(ciphertext).toString("base64"),
		iv: Buffer.from(iv).toString("base64"),
		kid: env.APP_ENCRYPTION_KEY_ID,
	};

	return JSON.stringify(payload);
}

/**
 * Decrypt a value encrypted by encryptValue.
 */
export async function decryptValue(encryptedJson: string): Promise<string> {
	const payload = JSON.parse(encryptedJson);

	if (payload.kid !== env.APP_ENCRYPTION_KEY_ID) {
		throw new Error(
			`Encryption key ID mismatch: expected ${env.APP_ENCRYPTION_KEY_ID}, got ${payload.kid}`,
		);
	}

	const key = await getEncryptionKey();
	const iv = Buffer.from(payload.iv, "base64");
	const ciphertext = Buffer.from(payload.ct, "base64");

	const decrypted = await crypto.subtle.decrypt(
		{ name: ALGO, iv },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(decrypted);
}

/**
 * Generate a random hex string of the given byte length.
 */
export function generateRandomHex(bytes: number): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
		"hex",
	);
}

/**
 * Hash a value using SHA-256 with a random salt.
 */
export async function hashWithSalt(
	value: string,
): Promise<{ hash: string; salt: string }> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const key = await deriveKey(value, salt);

	// Export key as hex to serve as the hash
	const rawKey = await crypto.subtle.exportKey("raw", key);
	return {
		hash: Buffer.from(rawKey).toString("hex"),
		salt: Buffer.from(salt).toString("hex"),
	};
}
