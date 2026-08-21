import type { PrismaClient } from '@jecrc/database';

/**
 * Extracts the effective domain gate for a user.
 * Returns:
 *   - The user's personal allowedDomains string (comma-separated) if set and non-empty
 *   - null if the user has no personal restriction (all domains allowed)
 *
 * The scoring engine interprets null as "no restriction".
 */
export async function getUserAllowedDomains(
  prisma: PrismaClient,
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { allowedDomains: true },
  });

  if (!user || !user.allowedDomains || user.allowedDomains.trim().length === 0) {
    return null;
  }

  return user.allowedDomains.trim();
}

/**
 * Checks whether a sender domain passes the user's personal domain gate.
 * Returns true if:
 *   - The user has no personal restriction (allowedDomains is null/empty)
 *   - OR the sender domain exactly matches one of the user's allowed domains
 *
 * Uses exact suffix match (no subdomain allowance) for security, consistent with
 * the existing isAllowedSender() behavior in domain-filter.ts.
 */
export function passesUserDomainGate(senderDomain: string | null, userAllowedDomains: string | null): boolean {
  // No restriction configured → allow everything
  if (!userAllowedDomains || userAllowedDomains.trim().length === 0) {
    return true;
  }

  // No sender domain could be extracted → fail the gate
  if (!senderDomain) {
    return false;
  }

  const allowedList = userAllowedDomains
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => d.length > 0);

  if (allowedList.length === 0) {
    return true; // empty list after parsing → treat as no restriction
  }

  return allowedList.includes(senderDomain.toLowerCase());
}
