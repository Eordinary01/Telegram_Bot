import { describe, it, expect } from 'vitest';
import { extractDeadline, generateGoogleCalendarUrl } from '../src/deadline.js';

describe('Deadline Extractor', () => {
  it('extracts date from "deadline: 30th July"', () => {
    const res = extractDeadline('Campus Drive Notice', 'Please note that the deadline: 30th July for TCS registration');
    expect(res.deadlineText).toBe('deadline: 30th July');
    expect(res.date).not.toBeNull();
    expect(res.date?.getDate()).toBe(30);
    expect(res.date?.getMonth()).toBe(6); // July is 0-indexed month 6
    expect(res.googleCalendarUrl).toContain('calendar.google.com');
  });

  it('extracts date from "due by 15/08/2026"', () => {
    const res = extractDeadline('Assignment Submission', 'Project submission is due by 15/08/2026 5 PM');
    expect(res.date).not.toBeNull();
    expect(res.date?.getDate()).toBe(15);
    expect(res.date?.getMonth()).toBe(7); // August = month 7
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('returns null for text with no deadlines', () => {
    const res = extractDeadline('Regular Newsletter', 'Welcome to the new academic session at JECRC');
    expect(res.deadlineText).toBeNull();
    expect(res.date).toBeNull();
    expect(res.googleCalendarUrl).toBeNull();
  });

  it('generates a valid Google Calendar TEMPLATE URL', () => {
    const targetDate = new Date(2026, 7, 15, 17, 0, 0);
    const url = generateGoogleCalendarUrl('Midterm Exam', 'Exam details snippet', targetDate);

    expect(url).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(url).toContain('text=%5BJECRC%20Deadline%5D%20Midterm%20Exam');
    expect(url).toContain('dates=20260815T');
  });
});
