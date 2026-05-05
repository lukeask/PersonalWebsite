/**
 * OpenSSL `enc -aes-128-cbc -md md5 -salt` compatible decrypt (browser-safe).
 * Used for accountpasswords.txt.enc — plaintext is not shipped in the JS bundle.
 */

import { cbc } from "@noble/ciphers/aes.js";
import { md5 } from "@noble/hashes/legacy.js";

// --- EVP_BytesToKey (OpenSSL default for enc; MD5, single iteration) ---

function evpBytesToKey(password: string, salt: Uint8Array): { key: Uint8Array; iv: Uint8Array } {
  const passBytes = new TextEncoder().encode(password);
  let prev = new Uint8Array(0);
  const out: number[] = [];
  const need = 32;
  while (out.length < need) {
    const buf = new Uint8Array(prev.length + passBytes.length + salt.length);
    buf.set(prev, 0);
    buf.set(passBytes, prev.length);
    buf.set(salt, prev.length + passBytes.length);
    prev = md5(buf);
    for (let i = 0; i < prev.length && out.length < need; i++) {
      out.push(prev[i]!);
    }
  }
  const merged = new Uint8Array(out);
  return { key: merged.slice(0, 16), iv: merged.slice(16, 32) };
}

/** Normalize PEM-style wrapped base64 into one string. */
function compactBase64(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * Decrypt OpenSSL salted AES-128-CBC payload (magic `Salted__`, 8-byte salt, ciphertext).
 * Returns UTF-8 plaintext or null if passphrase/format is wrong.
 */
export function decryptOpenSslEncAes128Cbc(base64Payload: string, passphrase: string): string | null {
  let raw: Uint8Array;
  try {
    const b64 = compactBase64(base64Payload);
    raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (raw.length < 16) return null;
  const magic = new TextDecoder().decode(raw.slice(0, 8));
  if (magic !== "Salted__") return null;
  const salt = raw.slice(8, 16);
  const ciphertext = raw.slice(16);
  if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) return null;

  const { key, iv } = evpBytesToKey(passphrase, salt);
  try {
    const decipher = cbc(key, iv);
    const plain = decipher.decrypt(ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Parse root's password line from decrypted credentials file content. */
export function extractRootPassword(decrypted: string): string | null {
  const m = decrypted.match(/\[root\]\s*\r?\n\s*password:\s*(\S+)/i);
  return m?.[1] ?? null;
}
