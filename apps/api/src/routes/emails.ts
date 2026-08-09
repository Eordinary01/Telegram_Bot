import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import { pushScoredEmail } from '@jecrc/telegram';
import { eventBroadcaster, type EmailEvent } from '../events.js';

const logger = getLogger('emails-routes');

interface EmailsDependencies {
  prisma: PrismaClient;
  config: AppConfig;
}

export function createEmailsRouter(dependencies: EmailsDependencies): Router {
  const router = Router();
  const { prisma, config } = dependencies;

  /**
   * GET /emails
   * Retrieves emails for a user with optional filtering by priority and search term.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const { priority, search, limit = '20', offset = '0' } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Build filter object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = { userId };

      if (priority && typeof priority === 'string' && priority.toUpperCase() !== 'ALL') {
        where.priorityLabel = priority.toUpperCase();
      }

      if (search && typeof search === 'string' && search.trim().length > 0) {
        where.OR = [
          { subject: { contains: search, mode: 'insensitive' } },
          { from: { contains: search, mode: 'insensitive' } },
          { snippet: { contains: search, mode: 'insensitive' } },
        ];
      }

      const take = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 100);
      const skip = Math.max(parseInt(offset as string, 10) || 0, 0);

      const [emails, total] = await Promise.all([
        prisma.email.findMany({
          where,
          orderBy: { receivedAt: 'desc' },
          take,
          skip,
        }),
        prisma.email.count({ where }),
      ]);

      return res.status(200).json({
        emails,
        total,
        limit: take,
        offset: skip,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch emails');
      return res.status(500).json({ error: 'Failed to fetch emails' });
    }
  });

  /**
   * GET /emails/stats
   * Aggregates email counts for dashboard stats cards.
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const [total, high, medium, low, unread, actionRequired, syncState] = await Promise.all([
        prisma.email.count({ where: { userId } }),
        prisma.email.count({ where: { userId, priorityLabel: 'HIGH' } }),
        prisma.email.count({ where: { userId, priorityLabel: 'MEDIUM' } }),
        prisma.email.count({ where: { userId, priorityLabel: 'LOW' } }),
        prisma.email.count({ where: { userId, isUnread: true } }),
        prisma.email.count({
          where: {
            userId,
            notifiedAt: { not: null },
            acknowledgedAt: null,
            priorityLabel: { in: ['HIGH', 'high', 'MEDIUM', 'medium'] },
          },
        }),
        prisma.syncState.findUnique({ where: { userId } }),
      ]);

      return res.status(200).json({
        total,
        high,
        medium,
        low,
        unread,
        actionRequired,
        lastSyncAt: syncState?.lastSyncAt?.toISOString() ?? null,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch email stats');
      return res.status(500).json({ error: 'Failed to fetch email stats' });
    }
  });

  /**
   * GET /emails/stream
   * Server-Sent Events (SSE) stream for real-time dashboard updates.
   */
  router.get('/stream', (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial ping event
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

    const handleEvent = (event: EmailEvent) => {
      if (event.userId === userId) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    eventBroadcaster.on(`user:${userId}`, handleEvent);

    req.on('close', () => {
      eventBroadcaster.off(`user:${userId}`, handleEvent);
      res.end();
    });
  });

  /**
   * POST /emails/inject-test
   * Testing endpoint to insert a sample email, trigger real-time SSE, and push to Telegram.
   */
  router.post('/inject-test', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const { type = 'placement' } = req.body as { type?: string };

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const randomId = Math.random().toString(36).substring(7);
      const now = new Date();

      let emailData = {
        userId,
        messageId: `test-msg-${randomId}`,
        threadId: `test-thread-${randomId}`,
        historyId: `hist-${Date.now()}`,
        from: 'placement.cell@jecrcu.edu.in',
        subject: '🚨 URGENT: Campus Placement Drive by Deloitte (2026 Batch)',
        snippet:
          'Mandatory registration link for Deloitte Placement Drive. Shortlisted candidates must submit resume by 5 PM today.',
        receivedAt: now,
        isUnread: true,
        labels: ['INBOX'],
        senderDomain: 'jecrcu.edu.in',
        priorityScore: 120,
        priorityLabel: 'HIGH',
        priorityReasons: [
          'Placement Notice (+50)',
          'Urgent Keyword (+40)',
          'Allowed Domain Suffix (+30)',
        ],
      };

      if (type === 'exam') {
        emailData = {
          ...emailData,
          from: 'examcell@jecrcu.edu.in',
          subject: '📝 IMPORTANT: End-Term Examination Schedule Released',
          snippet:
            'The final examination schedule for B.Tech Semester VI is attached. Practical exams begin next Monday.',
          priorityScore: 90,
          priorityLabel: 'HIGH',
          priorityReasons: ['Exam Schedule (+50)', 'Allowed Domain Suffix (+40)'],
        };
      } else if (type === 'low') {
        emailData = {
          ...emailData,
          from: 'library@jecrcu.edu.in',
          subject: '📚 Weekly Library Newsletter #18',
          snippet:
            'Check out the new arrival of computer science and AI reference books in the central library.',
          priorityScore: 15,
          priorityLabel: 'LOW',
          priorityReasons: ['Allowed Domain Suffix (+15)'],
        };
      }

      const savedEmail = await prisma.email.create({
        data: emailData,
      });

      // Broadcast real-time SSE event to Web Dashboard
      eventBroadcaster.broadcast({
        type: 'email_received',
        userId,
        data: savedEmail as unknown as Record<string, unknown>,
      });

      // Push notification to Telegram if linked
      let telegramPushed = false;
      if (config.TELEGRAM_BOT_TOKEN) {
        try {
          telegramPushed = await pushScoredEmail(prisma, config.TELEGRAM_BOT_TOKEN, userId, {
            from: savedEmail.from,
            subject: savedEmail.subject,
            snippet: savedEmail.snippet,
            messageId: savedEmail.messageId,
            priorityScore: savedEmail.priorityScore,
            priorityLabel: savedEmail.priorityLabel ?? 'HIGH',
            priorityReasons: savedEmail.priorityReasons,
            receivedAt: savedEmail.receivedAt,
          });
        } catch (tgError) {
          logger.warn({ error: tgError }, 'Failed to push test email to Telegram');
        }
      }

      logger.info(
        { userId, emailId: savedEmail.id, telegramPushed },
        'Test dummy email injected successfully',
      );

      return res.status(201).json({
        message: 'Test email injected successfully',
        email: savedEmail,
        telegramPushed,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to inject test email');
      return res.status(500).json({ error: 'Failed to inject test email' });
    }
  });

  /**
   * DELETE /emails/clear-test
   * Deletes test emails (or all emails if all=true) for a user.
   */
  router.delete('/clear-test', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const { all } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = { userId };
      if (all !== 'true') {
        where.messageId = { startsWith: 'test-msg-' };
      }

      const result = await prisma.email.deleteMany({ where });

      // Broadcast real-time SSE event to Web Dashboard
      eventBroadcaster.broadcast({
        type: 'sync_completed',
        userId,
      });

      logger.info({ userId, count: result.count, all: all === 'true' }, 'Cleared emails');

      return res.status(200).json({
        message: `Cleared ${result.count} email(s)`,
        count: result.count,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to clear emails');
      return res.status(500).json({ error: 'Failed to clear emails' });
    }
  });

  /**
   * PATCH /emails/:id/read
   * Marks an email as read in DB.
   */
  router.patch('/:id/read', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const userId = req.userId;

      if (!id) {
        return res.status(400).json({ error: 'Missing email id parameter' });
      }

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const email = await prisma.email.updateMany({
        where: { id, userId },
        data: { isUnread: false },
      });

      if (email.count === 0) {
        return res.status(404).json({ error: 'Email not found' });
      }

      const updated = await prisma.email.findUnique({ where: { id } });

      return res.status(200).json({ message: 'Email marked as read', email: updated });
    } catch (error) {
      logger.error({ error }, 'Failed to mark email as read');
      return res.status(500).json({ error: 'Failed to mark email as read' });
    }
  });

  /**
   * PATCH /emails/:id/acknowledge
   * Acknowledges an email — stops all escalating reminders for this email.
   */
  router.patch('/:id/acknowledge', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const userId = req.userId;

      if (!id) {
        return res.status(400).json({ error: 'Missing email id parameter' });
      }

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const email = await prisma.email.updateMany({
        where: { id, userId },
        data: { acknowledgedAt: new Date(), isUnread: false },
      });

      if (email.count === 0) {
        return res.status(404).json({ error: 'Email not found' });
      }

      const updated = await prisma.email.findUnique({ where: { id } });

      return res.status(200).json({ message: 'Email acknowledged', email: updated });
    } catch (error) {
      logger.error({ error }, 'Failed to acknowledge email');
      return res.status(500).json({ error: 'Failed to acknowledge email' });
    }
  });

  /**
   * GET /emails/action-required
   * Returns emails that have been notified but not yet acknowledged (HIGH + MEDIUM priority).
   */
  router.get('/action-required', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const emails = await prisma.email.findMany({
        where: {
          userId,
          notifiedAt: { not: null },
          acknowledgedAt: null,
          priorityLabel: { in: ['HIGH', 'high', 'MEDIUM', 'medium'] },
        },
        orderBy: { receivedAt: 'desc' },
      });

      return res.status(200).json({ emails, total: emails.length });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch action-required emails');
      return res.status(500).json({ error: 'Failed to fetch action-required emails' });
    }
  });

  return router;
}
