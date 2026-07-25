import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for sensitive tokens.
 * Returns encrypted data, IV, and authentication tag separately for storage.
 */
export interface EncryptedData {
  encrypted: string; // base64-encoded ciphertext
  iv: string; // base64-encoded initialization vector
  authTag: string; // base64-encoded authentication tag
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext - The text to encrypt (e.g., refresh token)
 * @param encryptionKey - Base64-encoded 32-byte key
 * @returns Object with encrypted data, IV, and auth tag
 */
export function encrypt(plaintext: string, encryptionKey: string): EncryptedData {
  const key = Buffer.from(encryptionKey, 'base64');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts data encrypted with AES-256-GCM.
 * @param data - Object containing encrypted data, IV, and auth tag
 * @param encryptionKey - Base64-encoded 32-byte key
 * @returns Decrypted plaintext
 */
export function decrypt(data: EncryptedData, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey, 'base64');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  const iv = Buffer.from(data.iv, 'base64');
  const authTag = Buffer.from(data.authTag, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
