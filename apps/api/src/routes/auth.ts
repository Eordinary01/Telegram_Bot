import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import {
  createOAuth2Client,
  getAuthorizationUrl,
  createOrUpdateUserFromOAuth,
  signAuthToken,
} from '@jecrc/auth';
import { registerWatch, storeWatchRegistration } from '@jecrc/gmail';

const logger = getLogger('auth-routes');

interface AuthDependencies {
  prisma: PrismaClient;
  config: AppConfig;
  requireAuth?: RequestHandler;
}

export function createAuthRouter(dependencies: AuthDependencies): Router {
  const router = Router();
  const { prisma, config, requireAuth } = dependencies;

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

      // Sign a stateless JWT for dashboard/API authentication
      const token = signAuthToken(user.id, config.JWT_SECRET, config.JWT_EXPIRES_IN);

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
      const dashboardUrl = `${config.WEB_ORIGIN}/dashboard?token=${encodeURIComponent(token)}`;
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Success</title>
            <meta http-equiv="refresh" content="2;url=${dashboardUrl}" />
          </head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #090d16; color: #f1f5f9;">
            <h1 style="color: #4ade80;">✅ Gmail Connected Successfully!</h1>
            <p style="font-size: 18px;">Welcome, ${user.name || user.email}</p>
            <p style="color: #94a3b8;">Your Gmail is now connected. Redirecting you to your priority dashboard...</p>
            <div style="margin-top: 30px;">
              <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Go to Live Dashboard →
              </a>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error({ error }, 'OAuth callback failed');
      const errorMsg = error instanceof Error ? error.message : '';
      const isDomainRestricted = errorMsg.startsWith('DOMAIN_RESTRICTED:');
      const userReason = isDomainRestricted
        ? errorMsg.replace('DOMAIN_RESTRICTED:', '')
        : 'Something went wrong while connecting your account. Please try again.';

      res.status(isDomainRestricted ? 403 : 500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Access Restricted — Authorized College Email Required</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #060910; color: #f1f5f9;">
            <div style="max-width: 480px; margin: 0 auto; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 20px; padding: 40px 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
              <div style="font-size: 52px; margin-bottom: 16px;">🎓</div>
              <h1 style="color: #f87171; font-size: 22px; font-weight: 700; margin-bottom: 12px;">${isDomainRestricted ? 'Authorized College Email Required' : 'Authentication Error'}</h1>
              <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <p style="color: #fca5a5; font-size: 14px; line-height: 1.6; margin: 0;">
                  ${userReason}
                </p>
              </div>
              <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 28px;">
                Please sign out of your personal Google account and authenticate using your official <b>@jecrcu.edu.in</b> student email.
              </p>
              <a href="${config.WEB_ORIGIN}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 14px rgba(59,130,246,0.3);">
                ← Back to Login
              </a>
            </div>
          </body>
        </html>
      `);

    }
  });

  /**
   * GET /auth/me
   * Returns the authenticated user info (requires valid JWT via middleware).
   */
  router.get(
    '/me',
    (req: Request, res: Response, next: NextFunction) => {
      if (requireAuth) {
        return requireAuth(req, res, next);
      }
      return next();
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.userId;

        if (!userId) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
          return res.status(404).json({ error: 'No user found' });
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
    },
  );

  return router;
}
