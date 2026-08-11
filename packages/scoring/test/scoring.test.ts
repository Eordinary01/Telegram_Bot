import { describe, it, expect, vi } from 'vitest';
import { extractSenderDomain, isAllowedSender, checkSenderDomain } from '../src/domain-filter.js';
import { classifyPriority, PRIORITY_LABELS } from '../src/scoring-engine.js';

describe('Domain Filter', () => {
  describe('extractSenderDomain', () => {
    it('extracts domain from standard From header with angle brackets', () => {
      const from = 'Placement Cell <placement@jecrcu.edu.in>';
      expect(extractSenderDomain(from)).toBe('jecrcu.edu.in');
    });

    it('extracts domain from bare email', () => {
      const from = 'faculty@jecrcu.edu.in';
      expect(extractSenderDomain(from)).toBe('jecrcu.edu.in');
    });

    it('handles display name with special characters', () => {
      const from = '"Exam Dept." <exam@jecrcu.edu.in>';
      expect(extractSenderDomain(from)).toBe('jecrcu.edu.in');
    });

    it('returns empty string for empty input', () => {
      expect(extractSenderDomain('')).toBe('');
    });

    it('returns empty string for malformed input', () => {
      expect(extractSenderDomain('not-an-email')).toBe('');
    });
  });

  describe('isAllowedSender', () => {
    const ALLOWED = 'jecrcu.edu.in';

    it('allows exact match', () => {
      expect(isAllowedSender('jecrcu.edu.in', ALLOWED)).toBe(true);
    });

    it('rejects subdomain (spoofing attempt)', () => {
      expect(isAllowedSender('fake.jecrcu.edu.in', ALLOWED)).toBe(false);
    });

    it('rejects similar but different domain', () => {
      expect(isAllowedSender('malicious-jecrcu.edu.in', ALLOWED)).toBe(false);
    });

    it('rejects completely unrelated domain', () => {
      expect(isAllowedSender('gmail.com', ALLOWED)).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isAllowedSender('JECRCU.EDU.IN', ALLOWED)).toBe(true);
    });

    it('returns false for empty inputs', () => {
      expect(isAllowedSender('', ALLOWED)).toBe(false);
      expect(isAllowedSender('jecrcu.edu.in', '')).toBe(false);
    });

    it('supports comma-separated multiple allowed domains', () => {
      const MULTI = 'jecrcu.edu.in, gmail.com, outlook.com';
      expect(isAllowedSender('jecrcu.edu.in', MULTI)).toBe(true);
      expect(isAllowedSender('gmail.com', MULTI)).toBe(true);
      expect(isAllowedSender('outlook.com', MULTI)).toBe(true);
      expect(isAllowedSender('yahoo.com', MULTI)).toBe(false);
    });

    it('supports wildcard * to allow all domains', () => {
      expect(isAllowedSender('anything.com', '*')).toBe(true);
    });
  });

  describe('checkSenderDomain', () => {
    const ALLOWED = 'jecrcu.edu.in';

    it('returns domain for allowed sender', () => {
      const result = checkSenderDomain('Placement <placement@jecrcu.edu.in>', ALLOWED);
      expect(result).toBe('jecrcu.edu.in');
    });

    it('returns null for non-allowed sender', () => {
      const result = checkSenderDomain('Spam <spam@gmail.com>', ALLOWED);
      expect(result).toBeNull();
    });

    it('returns null for unparseable header', () => {
      const result = checkSenderDomain('invalid', ALLOWED);
      expect(result).toBeNull();
    });
  });
});

describe('Priority Scoring Engine', () => {
  describe('classifyPriority', () => {
    it('classifies score >= 20 as high', () => {
      expect(classifyPriority(20)).toBe(PRIORITY_LABELS.HIGH);
      expect(classifyPriority(30)).toBe(PRIORITY_LABELS.HIGH);
      expect(classifyPriority(100)).toBe(PRIORITY_LABELS.HIGH);
    });

    it('classifies score >= 10 and < 20 as medium', () => {
      expect(classifyPriority(10)).toBe(PRIORITY_LABELS.MEDIUM);
      expect(classifyPriority(15)).toBe(PRIORITY_LABELS.MEDIUM);
      expect(classifyPriority(19)).toBe(PRIORITY_LABELS.MEDIUM);
    });

    it('classifies score < 10 as low', () => {
      expect(classifyPriority(0)).toBe(PRIORITY_LABELS.LOW);
      expect(classifyPriority(5)).toBe(PRIORITY_LABELS.LOW);
      expect(classifyPriority(9)).toBe(PRIORITY_LABELS.LOW);
    });

    it('handles negative scores as low', () => {
      expect(classifyPriority(-5)).toBe(PRIORITY_LABELS.LOW);
      expect(classifyPriority(-20)).toBe(PRIORITY_LABELS.LOW);
    });
  });
});
