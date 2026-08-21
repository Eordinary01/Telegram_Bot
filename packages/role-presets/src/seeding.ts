import { ROLE_PRESETS, type Role, type RolePreset } from '@jecrc/role-presets';
import type { PrismaClient } from '@jecrc/database';

/**
 * Seeds userId-scoped sender + keyword rules from a role preset.
 * Idempotent: skips rules that already exist for this user.
 *
 * Global seed rules (seed-rules.ts) remain the system defaults for
 * users without a role. Role presets ADD userId-scoped rules on top.
 */
export async function seedRulesFromRole(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<{ senderCount: number; keywordCount: number }> {
  const preset = ROLE_PRESETS[role];
  let senderCount = 0;
  let keywordCount = 0;

  for (const rule of preset.senderRules) {
    const existing = await prisma.senderRule.findFirst({
      where: {
        userId,
        domain: rule.domain.toLowerCase(),
        isActive: true,
      },
    });
    if (!existing) {
      await prisma.senderRule.create({
        data: {
          userId,
          domain: rule.domain.toLowerCase(),
          label: rule.label,
          weight: rule.weight,
          isActive: true,
        },
      });
      senderCount++;
    }
  }

  for (const rule of preset.keywordRules) {
    const existing = await prisma.keywordRule.findFirst({
      where: {
        userId,
        keyword: rule.keyword.toLowerCase(),
        matchField: rule.matchField,
        isActive: true,
      },
    });
    if (!existing) {
      await prisma.keywordRule.create({
        data: {
          userId,
          keyword: rule.keyword.toLowerCase(),
          weight: rule.weight,
          category: rule.category,
          matchField: rule.matchField,
          isActive: true,
        },
      });
      keywordCount++;
    }
  }

  return { senderCount, keywordCount };
}

/**
 * Builds a rules response shape for the frontend: user rules + global rules,
 * with the user's role included so the UI can show which preset is active.
 */
export async function getUserRulesWithRole(
  prisma: PrismaClient,
  userId: string,
): Promise<{
  role: string | null;
  userKeywords: Array<{ id: string; keyword: string; weight: number; category: string | null; matchField: string; isActive: boolean }>;
  globalKeywords: Array<{ id: string; keyword: string; weight: number; category: string | null; matchField: string; isActive: boolean }>;
  userSenders: Array<{ id: string; domain: string; label: string; weight: number; isActive: boolean }>;
  globalSenders: Array<{ id: string; domain: string; label: string; weight: number; isActive: boolean }>;
}> {
  const [user, userKeywords, globalKeywords, userSenders, globalSenders] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.keywordRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.keywordRule.findMany({ where: { userId: null, isActive: true }, orderBy: { keyword: 'asc' } }),
    prisma.senderRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.senderRule.findMany({ where: { userId: null, isActive: true }, orderBy: { domain: 'asc' } }),
  ]);

  return {
    role: user?.role ?? null,
    userKeywords: userKeywords.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      weight: r.weight,
      category: r.category,
      matchField: r.matchField,
      isActive: r.isActive,
    })),
    globalKeywords: globalKeywords.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      weight: r.weight,
      category: r.category,
      matchField: r.matchField,
      isActive: r.isActive,
    })),
    userSenders: userSenders.map((r) => ({
      id: r.id,
      domain: r.domain,
      label: r.label,
      weight: r.weight,
      isActive: r.isActive,
    })),
    globalSenders: globalSenders.map((r) => ({
      id: r.id,
      domain: r.domain,
      label: r.label,
      weight: r.weight,
      isActive: r.isActive,
    })),
  };
}
