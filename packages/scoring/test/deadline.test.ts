import { describe, it, expect } from 'vitest';
import { extractDeadline, generateGoogleCalendarUrl } from '../src/deadline.js';

describe('Deadline Extractor', () => {
  it('extracts date from "deadline: 30th July"', () => {
    const res = extractDeadline(
      'Campus Drive Notice',
      'Please note that the deadline: 30th July for TCS registration',
    );
    expect(res.deadlineText).toBe('deadline: 30th July');
    expect(res.date).not.toBeNull();
    expect(res.date?.getDate()).toBe(30);
    expect(res.date?.getMonth()).toBe(6); // July is 0-indexed month 6
    expect(res.googleCalendarUrl).toContain('calendar.google.com');
  });

  it('extracts date from "due by 15/08/2026"', () => {
    const res = extractDeadline(
      'Assignment Submission',
      'Project submission is due by 15/08/2026 5 PM',
    );
    expect(res.date).not.toBeNull();
    expect(res.date?.getDate()).toBe(15);
    expect(res.date?.getMonth()).toBe(7); // August = month 7
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('extracts date from "on or before wednesday 19-08-2026" (NPTEL style)', () => {
    const res = extractDeadline(
      'NPTEL: Intro to Machine Learning - Week 4 Assignment',
      'the assignment has to be submitted on or before wednesday 19-08-2026',
    );
    expect(res.deadlineText).not.toBeNull();
    expect(res.deadlineText).toContain('19-08-2026');
    expect(res.date).not.toBeNull();
    expect(res.date?.getDate()).toBe(19);
    expect(res.date?.getMonth()).toBe(7); // August = month 7
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('extracts deadline from full body text when snippet is empty', () => {
    const res = extractDeadline(
      'NPTEL Week 4 Assignment',
      null,
      'Dear Student, the assignment for the week has to be submitted on or before Wednesday, August 19, 2026 by 11:59 PM.',
    );
    expect(res.deadlineText).not.toBeNull();
    expect(res.deadlineText).toContain('Wednesday');
    expect(res.date?.getDate()).toBe(19);
    expect(res.date?.getMonth()).toBe(7);
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('extracts month-first date format "deadline is Wednesday, August 19, 2026"', () => {
    const res = extractDeadline(
      'Weekly Assignment',
      'Submission deadline is Wednesday, August 19, 2026',
    );
    expect(res.date?.getDate()).toBe(19);
    expect(res.date?.getMonth()).toBe(7);
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('extracts abbreviated month "submit by Aug 19 2026"', () => {
    const res = extractDeadline('Assignment', 'Please submit by Aug 19 2026');
    expect(res.date?.getDate()).toBe(19);
    expect(res.date?.getMonth()).toBe(7);
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('extracts weekday + dd/mm date "submit before friday 22/08/2026"', () => {
    const res = extractDeadline('Exam Notice', 'Please submit before friday 22/08/2026');
    expect(res.date?.getDate()).toBe(22);
    expect(res.date?.getMonth()).toBe(7);
    expect(res.date?.getFullYear()).toBe(2026);
  });

  it('extracts time with due date "due date 30 July 2026 11:59 pm"', () => {
    const res = extractDeadline('Assignment Due', 'due date 30 July 2026 11:59 pm');
    expect(res.date?.getDate()).toBe(30);
    expect(res.date?.getMonth()).toBe(6);
    expect(res.date?.getHours()).toBe(23);
    expect(res.date?.getMinutes()).toBe(59);
  });

  it('returns null for text with no deadlines', () => {
    const res = extractDeadline(
      'Regular Newsletter',
      'Welcome to the new academic session at JECRC',
    );
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
