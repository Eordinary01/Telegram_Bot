import { getLogger } from '@jecrc/observability';

const logger = getLogger('domain-filter');

/**
 * Extracts the sender domain from an email From header.
 *
 * Handles formats:
 *   - "Name <email@domain>""
 *   - "email@domain"
 *   - bare email addresses with potential display text
 */
export function extractSenderDomain(fromHeader: string): string {
  if (!fromHeader) return '';

  // Try to extract email from angle brackets first: "Name <user@domain>"
  const angleBracketMatch = fromHeader.match(/<([^>]+)>/);

  // Fallback: find first email-like pattern (contains @)
  const emailMatch = !angleBracketMatch
    ? fromHeader.match(/([^\s<]+@[^\s>]+)/)
    : null;

  const email = (angleBracketMatch?.[1] ?? emailMatch?.[1] ?? '').toLowerCase();

  if (!email) {
    logger.debug({ fromHeader }, 'Could not extract email from From header');
    return '';
  }

  const parts = email.split('@');
  if (parts.length !== 2 || !parts[1]) {
    logger.debug({ fromHeader, email }, 'Invalid email format');
    return '';
  }

  return parts[1].toLowerCase();
}

/**
 * Validates whether a sender's domain matches the allowed domain.
 *
 * Uses exact suffix match to prevent domain spoofing.
 * e.g., "jecrcu.edu.in" matches "jecrcu.edu.in" but NOT "malicious-jecrcu.edu.in"
 * or "fake.jecrcu.edu.in" (subdomains are rejected).
 */
export function isAllowedSender(senderDomain: string, allowedDomain: string): boolean {
  if (!senderDomain || !allowedDomain) return false;

  const normalizedSender = senderDomain.toLowerCase();
  const normalizedAllowed = allowedDomain.toLowerCase();

  return normalizedSender === normalizedAllowed;
}

/**
 * Checks if a sender's From header passes the allowed domain gate.
 * Returns the extracted domain if allowed, or null if filtered out.
 */
export function checkSenderDomain(
  fromHeader: string,
  allowedDomain: string,
): string | null {
  const domain = extractSenderDomain(fromHeader);

  if (!domain) {
    logger.debug({ fromHeader }, 'Could not parse sender domain');
    return null;
  }

  if (!isAllowedSender(domain, allowedDomain)) {
    logger.debug({ fromHeader, domain, allowedDomain }, 'Sender domain not allowed');
    return null;
  }

  return domain;
}
