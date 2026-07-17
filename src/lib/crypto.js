// Client-side AES-GCM encrypt/decrypt seam. Not yet wired into store/.
//
// The intent: personal free text (transcripts, task contents, project names)
// encrypted in the browser before any Firestore write, decrypted only in the
// browser after read, so the server and the database never hold plaintext
// personal data. That is not true today; the store writes task and project
// text as plaintext to Firestore. See README's Privacy section and
// docs/architecture.md.
//
// This module is the stable encrypt/decrypt shape the store will depend on
// once wired in. Key derivation and storage (per-user key, where it lives,
// how it is unlocked) are still open, and wiring this into the write path is
// separate, larger work, not attempted here.

const SUBTLE = globalThis.crypto?.subtle;

/**
 * Encrypt a UTF-8 string with AES-GCM.
 * @param {CryptoKey} key
 * @param {string} plaintext
 * @returns {Promise<{ iv: number[], ciphertext: number[] }>}
 */
export async function encryptString(key, plaintext) {
  if (!SUBTLE) throw new Error('WebCrypto subtle API unavailable');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const buf = await SUBTLE.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(buf)) };
}

/**
 * Decrypt an AES-GCM payload back to a UTF-8 string.
 * @param {CryptoKey} key
 * @param {{ iv: number[], ciphertext: number[] }} payload
 * @returns {Promise<string>}
 */
export async function decryptString(key, payload) {
  if (!SUBTLE) throw new Error('WebCrypto subtle API unavailable');
  const iv = new Uint8Array(payload.iv);
  const ciphertext = new Uint8Array(payload.ciphertext);
  const buf = await SUBTLE.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(buf);
}

/**
 * Generate a fresh AES-GCM key. Key management strategy is a Next item.
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
  if (!SUBTLE) throw new Error('WebCrypto subtle API unavailable');
  return SUBTLE.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt'
  ]);
}
