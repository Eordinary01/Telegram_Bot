import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

/**
 * Signs a stateless JWT for the given user id.
 * Used to authenticate the web dashboard against the API.
 */
export function signAuthToken(
  userId: string,
  secret: string,
  expiresIn: string | number = '24h',
): string {
  const options: SignOptions = {
    expiresIn: expiresIn as NonNullable<SignOptions['expiresIn']>,
  };
  return jwt.sign({ sub: userId }, secret, options);
}

/**
 * Verifies an auth token and returns the embedded user id.
 * Throws if the token is invalid or expired.
 */
export function verifyAuthToken(token: string, secret: string): { userId: string } {
  const payload = jwt.verify(token, secret) as { sub?: string };

  if (!payload.sub) {
    throw new Error('Token is missing subject claim');
  }

  return { userId: payload.sub };
}
