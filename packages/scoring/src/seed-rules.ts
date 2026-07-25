import { getConfig } from '@jecrc/config';
import { getPrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';

const logger = getLogger('seed-rules');

/**
 * Seeds default global sender and keyword rules for the JECRC Mail Priority Sync system.
 *
 * These rules are global (userId = null) and apply to all users.
 * They can be overridden or extended with user-specific rules later.
 */
async function seedRules(): Promise<void> {
  const config = getConfig();
  const prisma = getPrismaClient();

  logger.info('Seeding default scoring rules...');

  // ── Sender Rules ──────────────────────────────────────────────
  const senderRules = [
    { domain: 'placement@jecrcu.edu.in', label: 'Placement cell email', weight: 30 },
    { domain: 'exam@jecrcu.edu.in', label: 'Exam department email', weight: 25 },
    { domain: 'academics@jecrcu.edu.in', label: 'Academics department email', weight: 20 },
    { domain: 'hod@jecrcu.edu.in', label: 'HOD email', weight: 25 },
    { domain: 'faculty@jecrcu.edu.in', label: 'Faculty email', weight: 15 },
  ];

  for (const rule of senderRules) {
    const existing = await prisma.senderRule.findFirst({
      where: { domain: rule.domain, userId: null },
    });

    if (existing) {
      await prisma.senderRule.update({
        where: { id: existing.id },
        data: { label: rule.label, weight: rule.weight, isActive: true },
      });
    } else {
      await prisma.senderRule.create({
        data: {
          domain: rule.domain,
          label: rule.label,
          weight: rule.weight,
          isActive: true,
          userId: null,
        },
      });
    }

    logger.info({ domain: rule.domain, weight: rule.weight }, 'Sender rule seeded');
  }

  // ── Keyword Rules ─────────────────────────────────────────────
  const keywordRules = [
    { keyword: 'placement', weight: 20, category: 'placement', matchField: 'subject' },
    { keyword: 'campus drive', weight: 25, category: 'placement', matchField: 'any' },
    { keyword: 'job offer', weight: 30, category: 'placement', matchField: 'subject' },
    { keyword: 'interview', weight: 20, category: 'placement', matchField: 'subject' },
    { keyword: 'recruitment', weight: 20, category: 'placement', matchField: 'subject' },
    { keyword: 'company visit', weight: 20, category: 'placement', matchField: 'any' },
    { keyword: 'exam', weight: 20, category: 'exam', matchField: 'subject' },
    { keyword: 'midterm', weight: 20, category: 'exam', matchField: 'subject' },
    { keyword: 'semester exam', weight: 25, category: 'exam', matchField: 'subject' },
    { keyword: 'results', weight: 20, category: 'exam', matchField: 'subject' },
    { keyword: 'grade', weight: 15, category: 'exam', matchField: 'subject' },
    { keyword: 'marksheet', weight: 15, category: 'exam', matchField: 'subject' },
    { keyword: 'deadline', weight: 20, category: 'academic', matchField: 'subject' },
    { keyword: 'last date', weight: 20, category: 'academic', matchField: 'subject' },
    { keyword: 'registration', weight: 15, category: 'academic', matchField: 'subject' },
    { keyword: 'fee payment', weight: 20, category: 'academic', matchField: 'any' },
    { keyword: 'scholarship', weight: 20, category: 'academic', matchField: 'subject' },
    { keyword: 'urgent', weight: 25, category: 'urgency', matchField: 'subject' },
    { keyword: 'important', weight: 20, category: 'urgency', matchField: 'subject' },
    { keyword: 'action required', weight: 25, category: 'urgency', matchField: 'subject' },
    { keyword: 'notice', weight: 15, category: 'circular', matchField: 'subject' },
    { keyword: 'circular', weight: 15, category: 'circular', matchField: 'subject' },
  ];

  for (const rule of keywordRules) {
    const existing = await prisma.keywordRule.findFirst({
      where: { keyword: rule.keyword, userId: null, matchField: rule.matchField },
    });

    if (existing) {
      await prisma.keywordRule.update({
        where: { id: existing.id },
        data: {
          weight: rule.weight,
          category: rule.category,
          matchField: rule.matchField,
          isActive: true,
        },
      });
    } else {
      await prisma.keywordRule.create({
        data: {
          keyword: rule.keyword,
          weight: rule.weight,
          category: rule.category,
          matchField: rule.matchField,
          isActive: true,
          userId: null,
        },
      });
    }

    logger.info({ keyword: rule.keyword, weight: rule.weight }, 'Keyword rule seeded');
  }

  logger.info('Default scoring rules seeded successfully!');
  await prisma.$disconnect();
}

seedRules().catch((err) => {
  logger.error({ err }, 'Failed to seed rules');
  process.exit(1);
});
