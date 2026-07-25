import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../src/encryption.js';

describe('encryption', () => {
  const encryptionKey = randomBytes(32).toString('base64');

  it('should encrypt and decrypt a string successfully', () => {
    const plaintext = 'my-sensitive-refresh-token-12345';

    const encrypted = encrypt(plaintext, encryptionKey);

    expect(encrypted.encrypted).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();

    const decrypted = decrypt(encrypted, encryptionKey);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for the same plaintext (different IVs)', () => {
    const plaintext = 'my-sensitive-token';

    const encrypted1 = encrypt(plaintext, encryptionKey);
    const encrypted2 = encrypt(plaintext, encryptionKey);

    expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
  });

  it('should throw error when decrypting with wrong key', () => {
    const plaintext = 'my-sensitive-token';
    const wrongKey = randomBytes(32).toString('base64');

    const encrypted = encrypt(plaintext, encryptionKey);

    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('should throw error when decrypting tampered ciphertext', () => {
    const plaintext = 'my-sensitive-token';

    const encrypted = encrypt(plaintext, encryptionKey);

    // Tamper with the ciphertext
    const tamperedEncrypted = {
      ...encrypted,
      encrypted: encrypted.encrypted.substring(0, encrypted.encrypted.length - 5) + 'xxxxx',
    };

    expect(() => decrypt(tamperedEncrypted, encryptionKey)).toThrow();
  });

  it('should throw error with invalid key length', () => {
    const plaintext = 'my-token';
    const shortKey = randomBytes(16).toString('base64'); // Only 16 bytes, not 32

    expect(() => encrypt(plaintext, shortKey)).toThrow('Encryption key must be 32 bytes');
  });
});
