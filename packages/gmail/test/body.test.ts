import { describe, it, expect } from 'vitest';
import { extractBodyText, type GmailMessagePart } from '../src/history.js';

const encode = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

describe('extractBodyText', () => {
  it('decodes a simple text/plain body', () => {
    const payload: GmailMessagePart = {
      mimeType: 'text/plain',
      body: {
        data: encode('the assignment has to be submitted on or before wednesday 19-08-2026'),
      },
    };
    expect(extractBodyText(payload)).toContain('wednesday 19-08-2026');
  });

  it('prefers text/plain in a multipart/alternative payload', () => {
    const payload: GmailMessagePart = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: encode('<p>Hello <b>HTML</b></p>') } },
        { mimeType: 'text/plain', body: { data: encode('Hello plain text') } },
      ],
    };
    expect(extractBodyText(payload)).toBe('Hello plain text');
  });

  it('strips HTML when only an html part is present', () => {
    const payload: GmailMessagePart = {
      mimeType: 'text/html',
      body: { data: encode('<p>Dear Student, submit by Wednesday, August 19, 2026</p><br>Thanks') },
    };
    const text = extractBodyText(payload);
    expect(text).toContain('submit by Wednesday, August 19, 2026');
    expect(text).not.toContain('<p>');
  });

  it('joins multiple non-alternative parts', () => {
    const payload: GmailMessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: encode('Part one') } },
        { mimeType: 'text/plain', body: { data: encode('Part two') } },
      ],
    };
    const text = extractBodyText(payload);
    expect(text).toContain('Part one');
    expect(text).toContain('Part two');
  });

  it('returns empty string for missing payload', () => {
    expect(extractBodyText(undefined)).toBe('');
  });
});
