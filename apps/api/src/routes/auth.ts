import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import { createOAuth2Client, getAuthorizationUrl, createOrUpdateUserFromOAuth } from '@jecrc/auth';
import { registerWatch, storeWatchRegistration } from '@jecrc/gmail';

const logger = getLogger('auth-routes');

interface AuthDependencies {
  prisma: PrismaClient;
  config: AppConfig;
}

export function createAuthRouter(dependencies: AuthDependencies): Router {
  const router = Router();
  const { prisma, config } = dependencies;

  /**
   * GET /auth/google
   * Initiates Google OAuth flow by redirecting to Google's consent screen.
   */
  router.get('/google', (_req: Request, res: Response) => {
    try {
      const oauth2Client = createOAuth2Client(config);
      const state = Math.random().toString(36).substring(7); // Simple CSRF token
      const authUrl = getAuthorizationUrl(oauth2Client, state);

      // In production, store state in session/cookie and validate in callback
      res.redirect(authUrl);
    } catch (error) {
      logger.error({ error }, 'Failed to initiate OAuth flow');
      res.status(500).json({ error: 'Failed to initiate authentication' });
    }
  });

  /**
   * GET /auth/google/callback
   * Handles OAuth callback from Google, exchanges code for tokens,
   * and stores them in database. Returns success page.
   */
  router.get('/google/callback', async (req: Request, res: Response) => {
    try {
      const { code, error } = req.query;

      if (error) {
        const errorMessage = typeof error === 'string' ? error : 'Unknown error';
        logger.warn({ error: errorMessage }, 'OAuth callback received error');
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Authentication Failed</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>❌ Authentication Failed</h1>
              <p>Error: ${errorMessage}</p>
              <a href="/">Try Again</a>
            </body>
          </html>
        `);
      }

      if (!code || typeof code !== 'string') {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Authentication Failed</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>❌ Missing Authorization Code</h1>
              <a href="/">Try Again</a>
            </body>
          </html>
        `);
      }

      // Exchange code for tokens and create/update user
      const { user, accessToken } = await createOrUpdateUserFromOAuth(prisma, config, code);

      logger.info({ userId: user.id, email: user.email }, 'User connected Gmail successfully');

      // Register Gmail watch for push notifications (or get initial historyId)
      try {
        const oauth2Client = createOAuth2Client(config);
        oauth2Client.setCredentials({ access_token: accessToken });

        const watchData = await registerWatch(oauth2Client, config);
        await storeWatchRegistration(prisma, user.id, watchData);

        logger.info({ userId: user.id }, 'Gmail watch registered');
      } catch (watchError) {
        // Don't fail the auth flow if watch registration fails
        logger.error({ error: watchError, userId: user.id }, 'Failed to register Gmail watch');
      }

      // Return success page with redirect to Web Dashboard
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Success</title>
            <meta http-equiv="refresh" content="2;url=${config.WEB_ORIGIN}?userId=${user.id}" />
          </head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #090d16; color: #f1f5f9;">
            <h1 style="color: #4ade80;">✅ Gmail Connected Successfully!</h1>
            <p style="font-size: 18px;">Welcome, ${user.name || user.email}</p>
            <p style="color: #94a3b8;">Your Gmail is now connected. Redirecting you to your priority dashboard...</p>
            <div style="margin-top: 30px;">
              <a href="${config.WEB_ORIGIN}?userId=${user.id}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Go to Live Dashboard →
              </a>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error({ error }, 'OAuth callback failed');
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #090d16; color: #f1f5f9;">
            <h1 style="color: #f87171;">❌ Authentication Error</h1>
            <p>Something went wrong. Please try again.</p>
            <a href="${config.WEB_ORIGIN}" style="color: #60a5fa;">Back to Dashboard</a>
          </body>
        </html>
      `);
    }
  });

  /**
   * GET /auth/me
   * Returns current connected user info (for web dashboard)
   */
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const { userId } = req.query;

      let user = null;
      if (userId && typeof userId === 'string') {
        user = await prisma.user.findUnique({ where: { id: userId } });
      }

      // Fallback to most recently updated user if no userId parameter is provided
      if (!user) {
        user = await prisma.user.findFirst({
          orderBy: { updatedAt: 'desc' },
        });
      }

      if (!user) {
        return res.status(404).json({ error: 'No user session found' });
      }

      return res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        hasGmailToken: true,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get current user');
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
