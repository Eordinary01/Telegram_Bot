import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import type { Queue } from 'bullmq';
import type { RescanEmailsJob } from '@jecrc/queue';
import { getLogger } from '@jecrc/observability';
import {
  ROLE_PRESETS,
  AVAILABLE_ROLES,
  type Role,
  type RolePreset,
} from '@jecrc/role-presets';
import { seedRulesFromRole } from '@jecrc/role-presets/seeding';
import { queueRescan } from './rules.js';

const logger = getLogger('users-routes');

export const IMPACT_WEIGHTS = {
  high: 30,
  medium: 20,
  low: 10,
} as const;

export type Impact = keyof typeof IMPACT_WEIGHTS;

const VALID_MATCH_FIELDS = ['subject', 'snippet', 'any'] as const;

interface UsersRouterDeps {
  prisma: PrismaClient;
  config: AppConfig;
  emailRescanQueue: Queue<RescanEmailsJob>;
}

/**
 * PATCH /users/me/role
 *
 * Sets the authenticated user's role. On first assignment (role was null),
 * seeds userId-scoped sender + keyword rules from the role preset.
 * On any change (including re-assigning same role when rules were deleted),
 * queues a background re-scan so existing emails get re-scored.
 *
 * Body: { role: 'student' | 'teacher' | 'businessman' | 'freelancer' | 'developer' | 'other' }
 */
export function createUsersRouter(deps: UsersRouterDeps): Router {
  const router = Router();
  const { prisma, config, emailRescanQueue } = deps;

  // GET /users/me — returns user info with role; merges into /auth/me semantics
  // but this is the canonical users endpoint going forward.
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role ?? null,
        createdAt: user.createdAt,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch user profile');
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * PATCH /users/me/role
   * Sets the user's role and seeds preset rules on first assignment.
   */
  router.patch('/me/role', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { role } = req.body as { role?: string };
      if (!role || typeof role !== 'string') {
        return res.status(400).json({ error: 'role is required' });
      }

      const normalizedRole = role.toLowerCase().trim() as Role;
      if (!VALID_ROLES.has(normalizedRole)) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${AVAILABLE_ROLES.join(', ')}`,
        });
      }

      const preset = ROLE_PRESETS[normalizedRole];

      // Fetch current user state
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Detect whether this is the first time a role is being set (role was null/undefined)
      const isFirstRoleAssignment = user.role === null || user.role === undefined;

      // Update the role
      await prisma.user.update({
        where: { id: userId },
        data: { role: normalizedRole },
      });

      // On first assignment, seed the preset rules for this user
      let seedResult: { senderCount: number; keywordCount: number } | null = null;
      if (isFirstRoleAssignment) {
        seedResult = await seedRulesFromRole(prisma, userId, normalizedRole);
        logger.info(
          { userId, role: normalizedRole, ...seedResult },
          'Seeded role-preset rules for new role assignment',
        );
      }

      // Queue a re-scan so existing emails get re-scored against the new rule set
      const rescanResult = await queueRescan(userId, emailRescanQueue);

      return res.json({
        message: isFirstRoleAssignment
          ? 'Role set and priority rules seeded'
          : 'Role updated',
        role: normalizedRole,
        preset: {
          label: preset.label,
          description: preset.description,
        },
        seedResult,
        rescan: rescanResult,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to set user role');
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
