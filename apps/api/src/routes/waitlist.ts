import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import type { PrismaClient } from '@jecrc/database';
import nodemailer from 'nodemailer';
import type { AppConfig } from '@jecrc/config';

const ADMIN_EMAIL = 'parth.23bcon0051@jecrcu.edu.in';

interface WaitlistRouterDeps {
  prisma: PrismaClient;
  config: AppConfig;
  requireAuth: RequestHandler;
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

function buildFollowupEmailHtml(loginUrl: string, recipientName: string | null): string {
  const displayName = recipientName || 'there';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);padding:40px 30px;text-align:center;">
              <div style="font-size:40px;margin-bottom:12px;">📬</div>
              <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 8px 0;">PriorityPush</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Never miss an important email again</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 30px;">
              <h2 style="color:#1e293b;font-size:20px;font-weight:600;margin:0 0 16px 0;">Hey ${displayName} 👋</h2>
              <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 20px 0;">
                PriorityPush is now live for JECRC University students! You joined our waitlist and we wanted to let you know — you can start using it right now.
              </p>
              <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 28px 0;">
                Connect your <strong>@jecrcu.edu.in</strong> Google account and get real-time Telegram alerts for placement emails, exam notices, and faculty updates — scored by priority, delivered instantly.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);border-radius:10px;">
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
                      Login & Connect Gmail →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:28px 0 0 0;">
                It takes 30 seconds. Read-only access — we can't send or delete your emails. Your data stays private.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 30px;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
                Built for JECRC University students · Privacy first · Open source
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function createWaitlistRouter(deps: WaitlistRouterDeps): Router {
  const router = Router();
  const { prisma, config, requireAuth } = deps;

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
      const existing = await prisma.waitlist.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        res.status(200).json({ message: 'You are already on the waitlist!', alreadyExists: true });
        return;
      }

      // Create waitlist entry
      const entry = await prisma.waitlist.create({
        data: {
          email: normalizedEmail,
          name: name?.trim() || null,
          source: (req.query.source as string) || 'landing',
        },
      });

      // Get total count for social proof
      const totalCount = await prisma.waitlist.count();

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
      const count = await prisma.waitlist.count();
      res.json({ count });
    } catch (error) {
      console.error('Waitlist count error:', error);
      res.status(500).json({ error: 'Failed to fetch count' });
    }
  });

  // GET /waitlist/all — Get all waitlist entries (admin only)
  router.get('/all', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const entries = await prisma.waitlist.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, source: true, createdAt: true },
      });

      res.json({ entries, total: entries.length });
    } catch (error) {
      console.error('Waitlist fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch waitlist' });
    }
  });

  // POST /waitlist/send-followup — Send follow-up emails to waitlist (admin only)
  router.post('/send-followup', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const { subject, preview } = req.body;
      if (!subject || typeof subject !== 'string') {
        res.status(400).json({ error: 'Subject is required' });
        return;
      }

      // Get all waitlist entries
      const entries = await prisma.waitlist.findMany({
        orderBy: { createdAt: 'desc' },
      });

      if (entries.length === 0) {
        res.status(400).json({ error: 'No waitlist entries found' });
        return;
      }

      // Create SMTP transporter
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: config.SMTP_USER || ADMIN_EMAIL,
          pass: config.SMTP_PASS,
        },
      });

      const loginUrl = `${config.WEB_ORIGIN}/dashboard`;
      let sentCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // Send emails in batches of 5 to avoid rate limits
      for (let i = 0; i < entries.length; i += 5) {
        const batch = entries.slice(i, i + 5);
        const promises = batch.map(async (entry) => {
          try {
            await transporter.sendMail({
              from: `"PriorityPush" <${config.SMTP_USER || ADMIN_EMAIL}>`,
              to: entry.email,
              subject,
              html: buildFollowupEmailHtml(loginUrl, entry.name),
            });
            sentCount++;
          } catch (err) {
            failedCount++;
            errors.push(`${entry.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        });

        await Promise.all(promises);

        // Small delay between batches
        if (i + 5 < entries.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      res.json({
        message: `Follow-up emails sent`,
        sent: sentCount,
        failed: failedCount,
        total: entries.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error('Follow-up send error:', error);
      res.status(500).json({ error: 'Failed to send follow-up emails' });
    }
  });

  return router;
}
