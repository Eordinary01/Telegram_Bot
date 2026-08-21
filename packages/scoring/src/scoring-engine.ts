import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';
import { checkSenderDomain, extractSenderDomain } from './domain-filter.js';

const logger = getLogger('scoring-engine');

/**
 * Priority classification labels.
 */
export const PRIORITY_LABELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type PriorityLabel = (typeof PRIORITY_LABELS)[keyof typeof PRIORITY_LABELS];

/**
 * A pre-loaded sender rule for scoring.
 */
export interface SenderRuleEntry {
  domain: string;
  weight: number;
  label: string;
}

/**
 * A pre-loaded keyword rule for scoring.
 */
export interface KeywordRuleEntry {
  keyword: string;
  weight: number;
  category: string | null;
  matchField: string;
}

/**
 * Result of scoring an email.
 */
export interface ScoringResult {
  senderDomain: string | null;
  isAllowedDomain: boolean;
  priorityScore: number;
  priorityLabel: PriorityLabel;
  priorityReasons: string[];
}

/**
 * Thresholds for priority classification.
 * High >= 20, Medium >= 10, Low < 10
 */
const SCORE_THRESHOLDS = {
  HIGH: 20,
  MEDIUM: 10,
} as const;

/**
 * Classifies a numeric score into a priority label.
 */
export function classifyPriority(score: number): PriorityLabel {
  if (score >= SCORE_THRESHOLDS.HIGH) return PRIORITY_LABELS.HIGH;
  if (score >= SCORE_THRESHOLDS.MEDIUM) return PRIORITY_LABELS.MEDIUM;
  return PRIORITY_LABELS.LOW;
}

/**
 * Loads all active sender rules relevant to a user.
 * Returns both global rules (userId = null) and user-specific rules.
 */
export async function loadSenderRules(
  prisma: PrismaClient,
  userId: string,
): Promise<SenderRuleEntry[]> {
  const rules = await prisma.senderRule.findMany({
    where: {
      isActive: true,
      OR: [{ userId: null }, { userId }],
    },
    select: { domain: true, weight: true, label: true },
  });

  return rules;
}

/**
 * Loads all active keyword rules relevant to a user.
 * Returns both global rules (userId = null) and user-specific rules.
 */
export async function loadKeywordRules(
  prisma: PrismaClient,
  userId: string,
): Promise<KeywordRuleEntry[]> {
  const rules = await prisma.keywordRule.findMany({
    where: {
      isActive: true,
      OR: [{ userId: null }, { userId }],
    },
    select: { keyword: true, weight: true, category: true, matchField: true },
  });

  return rules;
}

/**
 * Scores an email against sender rules.
 * Returns total weight and list of matched reasons.
 */
function scoreAgainstSenderRules(
  senderDomain: string | null,
  fromHeader: string,
  rules: SenderRuleEntry[],
): { score: number; reasons: string[] } {
  if (!senderDomain) return { score: 0, reasons: [] };

  let score = 0;
  const reasons: string[] = [];
  const fromLower = fromHeader.toLowerCase();

  for (const rule of rules) {
    const domainLower = rule.domain.toLowerCase();

    if (fromLower.includes(domainLower)) {
      score += rule.weight;
      reasons.push(rule.label);
    }
  }

  return { score, reasons };
}

/**
 * Scores an email subject/snippet against keyword rules.
 * Returns total weight and list of matched reasons.
 */
function scoreAgainstKeywordRules(
  subject: string,
  snippet: string | null,
  rules: KeywordRuleEntry[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const subjectLower = subject.toLowerCase();
  const snippetLower = (snippet ?? '').toLowerCase();

  for (const rule of rules) {
    const keywordLower = rule.keyword.toLowerCase();
    let matched = false;

    switch (rule.matchField) {
      case 'subject':
        matched = subjectLower.includes(keywordLower);
        break;
      case 'snippet':
        matched = snippetLower.includes(keywordLower);
        break;
      case 'any':
      default:
        matched = subjectLower.includes(keywordLower) || snippetLower.includes(keywordLower);
        break;
    }

    if (matched) {
      score += rule.weight;
      const reason = rule.category
        ? `Keyword "${rule.keyword}" matched in ${rule.matchField} [${rule.category}]`
        : `Keyword "${rule.keyword}" matched in ${rule.matchField}`;
      reasons.push(reason);
    }
  }

  return { score, reasons };
}

/**
 * Scores an email for priority based on:
 * 1. Sender domain gate (non-allowed domains get low score)
 * 2. Sender rules (domain-specific weights)
 * 3. Keyword rules (subject/snippet matching)
 *
 * For batch processing, pre-load rules with `loadSenderRules()`/`loadKeywordRules()`
 * and pass them as `preloadedSenderRules`/`preloadedKeywordRules` to avoid
 * per-email DB queries.
 *
 * @param prisma - Prisma client for DB access (not needed if pre-loaded rules provided)
 * @param userId - User ID to load user-specific rules (not needed if pre-loaded rules provided)
 * @param fromHeader - Email From header
 * @param subject - Email subject
 * @param snippet - Email snippet (optional)
 * @param allowedDomain - Configured allowed sender domain
 * @param preloadedSenderRules - Optional pre-loaded sender rules (avoids DB query)
 * @param preloadedKeywordRules - Optional pre-loaded keyword rules (avoids DB query)
 * @returns Scoring result with domain info, score, label, and reasons
 */
export async function scoreEmail(
  prisma: PrismaClient,
  userId: string,
  fromHeader: string,
  subject: string,
  snippet: string | null,
  allowedDomain: string | null,
  preloadedSenderRules?: SenderRuleEntry[],
  preloadedKeywordRules?: KeywordRuleEntry[],
): Promise<ScoringResult> {
  // Step 1: Extract sender domain
  const senderDomain = extractSenderDomain(fromHeader) || null;

  // Step 2: Load rules (use pre-loaded if provided, otherwise query DB)
  const [senderRules, keywordRules] = preloadedSenderRules && preloadedKeywordRules
    ? [preloadedSenderRules, preloadedKeywordRules]
    : await Promise.all([
        loadSenderRules(prisma, userId),
        loadKeywordRules(prisma, userId),
      ]);

  // Step 3: Domain gate — if user has allowedDomains set, only allowed senders pass
  let baseScore = 0;
  const baseReasons: string[] = [];

  // allowedDomain can be:
  //   null/empty → no domain restriction (all senders pass the gate)
  //   comma-separated list e.g. "jecrcu.edu.in,abc.edu.in" → exact suffix match
  const allowedList = allowedDomain
    ? allowedDomain
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter((d) => d.length > 0)
    : [];

  if (senderDomain && allowedDomain && allowedDomain.trim().toLowerCase() !== '*') {
    if (allowedList.includes(senderDomain.toLowerCase())) {
      baseScore += 10;
      baseReasons.push(`Allowed domain (${senderDomain})`);
    }
    // If sender domain does NOT match and user has a restrictive domain list,
    // the email fails the domain gate. It still gets scored by rules but gets
    // a LOW label and a clear isAllowedDomain: false.
  }

  const isAllowedDomain = !senderDomain
    ? false
    : !allowedDomain || allowedDomain.trim().toLowerCase() === '*'
      ? true
      : allowedList.includes(senderDomain.toLowerCase());

  // Early return for non-passing domain when user is domain-restricted:
  // score by rules anyway (so user sees why it was filtered), but force LOW.
  const permittingDomain = isAllowedDomain;

  // Step 4: Score against sender rules (e.g. nptel.iitm.ac.in, custom senders)
  const senderResult = scoreAgainstSenderRules(senderDomain, fromHeader, senderRules);

  // Step 5: Score against keyword rules
  const keywordResult = scoreAgainstKeywordRules(subject, snippet, keywordRules);

  // Step 6: Calculate total score
  const totalScore = baseScore + senderResult.score + keywordResult.score;
  const allReasons = [...baseReasons, ...senderResult.reasons, ...keywordResult.reasons];

  // Step 7: Classify priority.
  // If the domain gate failed AND no user rules matched, force LOW and cap score.
  // But if the user has explicitly defined rules that matched (sender or keyword),
  // those rules take precedence — the user intended those emails to be prioritized.
  const hasUserRules = senderResult.score > 0 || keywordResult.score > 0;
  let finalScore = totalScore;
  let label: PriorityLabel;
  if (!permittingDomain && allowedDomain && allowedDomain.trim().toLowerCase() !== '*' && !hasUserRules) {
    label = PRIORITY_LABELS.LOW;
    finalScore = Math.min(totalScore, 9);
  } else {
    label = classifyPriority(totalScore);
  }

  logger.debug(
    {
      senderDomain,
      finalScore,
      label,
      isAllowedDomain,
      reasonCount: allReasons.length,
    },
    'Email scored',
  );

  return {
    senderDomain,
    isAllowedDomain,
    priorityScore: finalScore,
    priorityLabel: label,
    priorityReasons: allReasons.length > 0 ? allReasons : ['Standard email, no specific priority rules matched'],
  };
}
