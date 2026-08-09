import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from '@jecrc/config';
import { verifyAuthToken } from '@jecrc/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Express middleware that requires a valid JWT.
 * Reads the token from the `Authorization: Bearer <token>` header,
 * or from the `?token=` query parameter (needed for SSE/EventSource,
 * which cannot set custom headers).
 * On success, sets `req.userId` and continues. Otherwise responds 401.
 */
export function createRequireAuth(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : queryToken;

    if (!token) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    try {
      const { userId } = verifyAuthToken(token, config.JWT_SECRET);
      req.userId = userId;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
