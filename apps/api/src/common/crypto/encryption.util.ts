import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// AES-256-GCM at-rest encryption for per-customer secrets (e.g. Yolink secret
// keys) that must be recoverable in plaintext to call a third-party API,
// unlike passwords which are one-way hashed. ENCRYPTION_KEY is a single env
// secret; scrypt derives a fixed 32-byte key from it so any passphrase length
// works. Ciphertext is stored as base64(iv):base64(authTag):base64(data).
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function deriveKey(): Buffer {
  const passphrase = process.env.ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error('ENCRYPTION_KEY is not set — required to store/read encrypted credentials');
  }
  return scryptSync(passphrase, 'houmi-encryption-salt', 32);
}

export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivB64, authTagB64, dataB64] = ciphertext.split(':');
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error('Malformed ciphertext');
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
