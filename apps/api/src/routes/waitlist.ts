import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@jecrc/database';

interface WaitlistRouterDeps {
  prisma: PrismaClient;
}

// Simple in-memory rate limit: max 5 signups per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now > record.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createWaitlistRouter(deps: WaitlistRouterDeps): Router {
  const router = Router();

  // POST /waitlist — Join waitlist
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { email, name } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (!isValidEmail(normalizedEmail)) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }

      // Rate limit check
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(clientIp)) {
        res.status(429).json({ error: 'Too many requests. Please try again later.' });
        return;
      }

      // Check if email already exists
      const existing = await deps.prisma.waitlist.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        res.status(200).json({ message: 'You are already on the waitlist!', alreadyExists: true });
        return;
      }

      // Create waitlist entry
      const entry = await deps.prisma.waitlist.create({
        data: {
          email: normalizedEmail,
          name: name?.trim() || null,
          source: (req.query.source as string) || 'landing',
        },
      });

      // Get total count for social proof
      const totalCount = await deps.prisma.waitlist.count();

      res.status(201).json({
        message: 'Welcome to the waitlist!',
        position: totalCount,
        id: entry.id,
      });
    } catch (error) {
      console.error('Waitlist signup error:', error);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // GET /waitlist/count — Get total waitlist count
  router.get('/count', async (_req: Request, res: Response) => {
    try {
      const count = await deps.prisma.waitlist.count();
      res.json({ count });
    } catch (error) {
      console.error('Waitlist count error:', error);
      res.status(500).json({ error: 'Failed to fetch count' });
    }
  });

  return router;
}
