import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@jecrc/observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { formatEmailMessage } = await import('../src/push.js');

describe('formatEmailMessage', () => {
  const baseEmail = {
    from: 'Placement Cell <placement@jecrcu.edu.in>',
    subject: 'Placement Drive - Infosys Recruitment',
    snippet: 'Dear students, Infosys is organizing a placement drive on campus next week.',
    priorityScore: 30,
    priorityLabel: 'high',
    priorityReasons: ['Placement Cell', 'Keyword "placement" matched in subject [Placement]'],
    receivedAt: new Date('2025-06-15T10:30:00+05:30'),
    messageId: 'msg-123',
  };

  it('should format a high-priority email correctly', () => {
    const message = formatEmailMessage(baseEmail);

    expect(message).toContain('📧');
    expect(message).toContain('HIGH (Score: 30)');
    expect(message).toContain('Placement Cell');
    expect(message).toContain('Infosys');
    expect(message).toContain('Placement Cell');
    expect(message).toContain('placement');
    expect(message).toContain('15 Jun');
  });

  it('should include priority reasons', () => {
    const message = formatEmailMessage(baseEmail);

    expect(message).toContain('Reasons');
    expect(message).toContain('Placement Cell');
    expect(message).toContain('placement');
  });

  it('should format medium priority with yellow dot', () => {
    const mediumEmail = {
      ...baseEmail,
      priorityScore: 15,
      priorityLabel: 'medium',
      priorityReasons: ['Academic notice'],
    };

    const message = formatEmailMessage(mediumEmail);

    expect(message).toContain('🟡');
    expect(message).toContain('MEDIUM');
  });

  it('should format low priority with white dot', () => {
    const lowEmail = {
      ...baseEmail,
      priorityScore: 5,
      priorityLabel: 'low',
      priorityReasons: ['General notice'],
    };

    const message = formatEmailMessage(lowEmail);

    expect(message).toContain('⚪');
    expect(message).toContain('LOW');
  });

  it('should handle missing snippet gracefully', () => {
    const noSnippetEmail = {
      ...baseEmail,
      snippet: null,
    };

    const message = formatEmailMessage(noSnippetEmail);

    expect(message).not.toContain('💬');
    expect(message).toContain('HIGH');
  });

  it('should handle empty reasons', () => {
    const noReasonsEmail = {
      ...baseEmail,
      priorityReasons: [],
    };

    const message = formatEmailMessage(noReasonsEmail);

    expect(message).not.toContain('Reasons');
    expect(message).toContain('HIGH');
  });

  it('should truncate long snippets to 300 chars', () => {
    const longSnippetEmail = {
      ...baseEmail,
      snippet: 'A'.repeat(500),
    };

    const message = formatEmailMessage(longSnippetEmail);

    // Should not contain the full 500 chars
    expect(message.length).toBeLessThan(5000);
    // Should end with ellipsis indicator
    expect(message).not.toContain('A'.repeat(400));
  });

  it('should not exceed Telegram 4096 char limit', () => {
    const longSubjectEmail = {
      ...baseEmail,
      subject: 'S'.repeat(2000),
      snippet: 'A'.repeat(2000),
      priorityReasons: Array(20).fill('Very long reason string to test message length limits'),
    };

    const message = formatEmailMessage(longSubjectEmail);

    expect(message.length).toBeLessThanOrEqual(4096);
  });

  it('should include IST time in the output', () => {
    const message = formatEmailMessage(baseEmail);

    expect(message).toContain('IST');
  });
});
