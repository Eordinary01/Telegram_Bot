import { describe, it, expect, vi } from 'vitest';

vi.mock('@jecrc/observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { formatEmailMessage, buildSmartButtons, formatReminderMessage } = await import('../src/push.js');

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
    const { message } = formatEmailMessage(baseEmail);

    expect(message).toContain('📧');
    expect(message).toContain('HIGH (Score: 30)');
    expect(message).toContain('Placement Cell');
    expect(message).toContain('Infosys');
    expect(message).toContain('Placement Cell');
    expect(message).toContain('placement');
    expect(message).toContain('15 Jun');
  });

  it('should include priority reasons', () => {
    const { message } = formatEmailMessage(baseEmail);

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

    const { message } = formatEmailMessage(mediumEmail);

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

    const { message } = formatEmailMessage(lowEmail);

    expect(message).toContain('⚪');
    expect(message).toContain('LOW');
  });

  it('should handle missing snippet gracefully', () => {
    const noSnippetEmail = {
      ...baseEmail,
      snippet: null,
    };

    const { message } = formatEmailMessage(noSnippetEmail);

    expect(message).not.toContain('💬');
    expect(message).toContain('HIGH');
  });

  it('should handle empty reasons', () => {
    const noReasonsEmail = {
      ...baseEmail,
      priorityReasons: [],
    };

    const { message } = formatEmailMessage(noReasonsEmail);

    expect(message).not.toContain('Reasons');
    expect(message).toContain('HIGH');
  });

  it('should truncate long snippets to 300 chars', () => {
    const longSnippetEmail = {
      ...baseEmail,
      snippet: 'A'.repeat(500),
    };

    const { message } = formatEmailMessage(longSnippetEmail);

    expect(message.length).toBeLessThan(5000);
    expect(message).not.toContain('A'.repeat(400));
  });

  it('should not exceed Telegram 4096 char limit', () => {
    const longSubjectEmail = {
      ...baseEmail,
      subject: 'S'.repeat(2000),
      snippet: 'A'.repeat(2000),
      priorityReasons: Array(20).fill('Very long reason string to test message length limits'),
    };

    const { message } = formatEmailMessage(longSubjectEmail);

    expect(message.length).toBeLessThanOrEqual(4096);
  });

  it('should include IST time in the output', () => {
    const { message } = formatEmailMessage(baseEmail);

    expect(message).toContain('IST');
  });
});

describe('buildSmartButtons', () => {
  it('should build 2 rows of inline buttons with acknowledge, snooze menu, and dismiss', () => {
    const buttons = buildSmartButtons('msg-999', null);

    expect(buttons).toHaveLength(2);
    expect(buttons[0]![0]!.text).toContain('Acknowledge');
    expect(buttons[0]![0]!.callback_data).toBe('acknowledge:msg-999');
    expect(buttons[0]![1]!.text).toContain('Snooze');
    expect(buttons[0]![1]!.callback_data).toBe('snooze_menu:msg-999');
    expect(buttons[1]![0]!.text).toMatch(/Not Interested|Dismiss/);
    expect(buttons[1]![0]!.callback_data).toBe('dismiss:msg-999');
  });


  it('should include google calendar link when provided', () => {
    const buttons = buildSmartButtons('msg-999', 'https://calendar.google.com/test');

    expect(buttons[1]).toHaveLength(2);
    expect(buttons[1]![1]!.text).toContain('Add to Calendar');
    expect(buttons[1]![1]!.url).toBe('https://calendar.google.com/test');
  });
});

describe('formatReminderMessage', () => {
  const reminderEmail = {
    from: 'Dean Academics <dean@jecrcu.edu.in>',
    subject: 'Mandatory Seminar Attendance',
    snippet: 'All final year students must attend.',
    priorityScore: 40,
    priorityLabel: 'high',
    receivedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    messageId: 'msg-rem-1',
    reminderCount: 0,
  };

  it('should format gentle first reminder (count 0)', () => {
    const msg = formatReminderMessage({ ...reminderEmail, reminderCount: 0 });

    expect(msg).toContain('Gentle Reminder');
    expect(msg).toContain('Mandatory Seminar Attendance');
    expect(msg).toContain('#1 of 3');
  });

  it('should format urgent second reminder (count 1)', () => {
    const msg = formatReminderMessage({ ...reminderEmail, reminderCount: 1 });

    expect(msg).toContain('URGENT Reminder');
    expect(msg).toContain('#2 of 3');
  });

  it('should format final reminder (count 2)', () => {
    const msg = formatReminderMessage({ ...reminderEmail, reminderCount: 2 });

    expect(msg).toContain('FINAL Reminder');
    expect(msg).toContain('#3 of 3');
  });
});

