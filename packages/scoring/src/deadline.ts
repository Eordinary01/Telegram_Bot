/**
 * Deadline Extraction & Calendar Export Utilities for JECRC Emails.
 */

export interface ExtractedDeadline {
  deadlineText: string | null;
  date: Date | null;
  googleCalendarUrl: string | null;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const WEEKDAYS =
  /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)/i;

const MONTH_NAMES =
  /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)/i;

// Pre-compiled deadline regexes (avoid recompilation per call)
const DEADLINE_REGEX = new RegExp(
  [
    '(?:deadline|last date|due date|due|submit by|submission date|submission|on or before|before|by)',
    '(?:\\s*(?:for|of|to|is|on|by|at|set|until|till|:|-)*[a-z0-9_ -]{0,30}?\\b)?',
    '\\s*',
    '(?:',
    WEEKDAYS.source,
    '(?:,\\s*|\\s+)?',
    ')?',
    '(',
    // 30th July / 30 July 2026
    '[0-9]{1,2}(?:st|nd|rd|th)?\\s+',
    MONTH_NAMES.source,
    '(?:\\s*,?\\s+[0-9]{4})?',
    '|',
    // August 19, 2026 / Aug 19 2026 (month-first)
    MONTH_NAMES.source,
    '\\s+[0-9]{1,2}(?:st|nd|rd|th)?',
    '(?:\\s*,?\\s+[0-9]{4})?',
    '|',
    // YYYY-MM-DD or YYYY/MM/DD
    '[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}',
    '|',
    // 15/08/2026 or 15-08-2026
    '[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}',
    '|',
    '\\btomorrow\\b|\\btoday\\b',
    ')',
    '(?:\\s+(?:by|at)?\\s*([0-9]{1,2}(?::[0-9]{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?))?',
  ].join(''),
  'i',
);

const FALLBACK_DATE_REGEX = new RegExp(
  [
    '(?:',
    WEEKDAYS.source,
    '(?:,\\s*|\\s+)?',
    ')?',
    '(',
    '[0-9]{1,2}(?:st|nd|rd|th)?\\s+',
    MONTH_NAMES.source,
    '(?:\\s*,?\\s+[0-9]{4})?',
    '|',
    MONTH_NAMES.source,
    '\\s+[0-9]{1,2}(?:st|nd|rd|th)?',
    '(?:\\s*,?\\s+[0-9]{4})?',
    '|',
    '[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}',
    '|',
    '[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}',
    ')',
    '(?:\\s+(?:by|at)?\\s*([0-9]{1,2}(?::[0-9]{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?))?',
  ].join(''),
  'i',
);

/**
 * Extracts a deadline date and text from email subject, snippet & body,
 * and generates a Google Calendar template URL if a valid date is found.
 */
export function extractDeadline(
  subject: string,
  snippet: string | null,
  bodyText?: string | null,
): ExtractedDeadline {
  const text = `${subject} ${snippet ?? ''} ${bodyText ?? ''}`;

  const match = text.match(DEADLINE_REGEX);
  let rawDateStr = match ? match[1] ?? '' : '';
  let rawTimeStr = match ? match[2] : undefined;
  let fullMatchedText = match ? (match[0] ?? '').trim() : '';

  // Fallback: If primary regex did not match a valid date, but the text contains a deadline keyword,
  // scan for standalone date pattern.
  if (!match || !rawDateStr) {
    const hasKeyword = /(?:deadline|last date|due date|due|submit|submission|on or before)/i.test(
      text,
    );
    if (hasKeyword) {
      const fallbackMatch = text.match(FALLBACK_DATE_REGEX);
      if (fallbackMatch && fallbackMatch[1]) {
        rawDateStr = fallbackMatch[1];
        rawTimeStr = fallbackMatch[2];
        fullMatchedText = fallbackMatch[0].trim();
      }
    }
  }

  if (!rawDateStr) {
    return { deadlineText: null, date: null, googleCalendarUrl: null };
  }

  const parsedDate = parseRelativeOrExplicitDate(rawDateStr.trim(), rawTimeStr?.trim());

  let calendarUrl: string | null = null;
  if (parsedDate) {
    calendarUrl = generateGoogleCalendarUrl(subject, snippet ?? subject, parsedDate);
  }

  return {
    deadlineText: fullMatchedText,
    date: parsedDate,
    googleCalendarUrl: calendarUrl,
  };
}

/**
 * Parses relative terms ("today", "tomorrow") or date strings like "30th July", "15-08-2026", "2026-08-15".
 */
function parseRelativeOrExplicitDate(dateStr: string, timeStr?: string): Date | null {
  const now = new Date();
  const cleanDate = dateStr
    .toLowerCase()
    .replace(/([0-9]{1,2})(?:st|nd|rd|th)\b/g, '$1')
    .trim();

  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();

  if (cleanDate === 'today') {
    // Keep today's Y/M/D
  } else if (cleanDate === 'tomorrow') {
    day += 1;
  } else {
    // Try YYYY-MM-DD or YYYY/MM/DD (ISO format)
    const isoMatch = cleanDate.match(/^([0-9]{4})[/-]([0-9]{1,2})[/-]([0-9]{1,2})$/);
    // Try DD/MM/YYYY or DD-MM-YYYY
    const numericMatch = cleanDate.match(/^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2,4})$/);
    // Try "30 July" / "30 July 2026"
    const textMatch = cleanDate.match(/^([0-9]{1,2})\s+([a-z]{3,9})(?:\s+([0-9]{4}))?$/);
    // Try "August 19, 2026" / "Aug 19 2026" (month-first)
    const monthFirstMatch = cleanDate.match(
      /^([a-z]{3,9})\s+([0-9]{1,2})(?:\s*,?\s+([0-9]{4}))?$/,
    );

    if (isoMatch) {
      const yearStr = isoMatch[1];
      const monthStr = isoMatch[2];
      const dayStr = isoMatch[3];
      if (!yearStr || !monthStr || !dayStr) return null;
      year = parseInt(yearStr, 10);
      month = parseInt(monthStr, 10) - 1;
      day = parseInt(dayStr, 10);
    } else if (numericMatch) {
      const dayStr = numericMatch[1];
      const monthStr = numericMatch[2];
      const yearStr = numericMatch[3];
      if (!dayStr || !monthStr || !yearStr) return null;
      day = parseInt(dayStr, 10);
      month = parseInt(monthStr, 10) - 1;
      let yr = parseInt(yearStr, 10);
      if (yr < 100) yr += 2000;
      year = yr;
    } else if (textMatch) {
      const dayStr = textMatch[1];
      const monthName = textMatch[2];
      if (!dayStr || !monthName) return null;
      day = parseInt(dayStr, 10);
      const mappedMonth = MONTH_MAP[monthName];
      if (mappedMonth === undefined) return null;
      month = mappedMonth;
      if (textMatch[3]) year = parseInt(textMatch[3], 10);
    } else if (monthFirstMatch) {
      const monthName = monthFirstMatch[1];
      const dayStr = monthFirstMatch[2];
      if (!dayStr || !monthName) return null;
      const mappedMonth = MONTH_MAP[monthName];
      if (mappedMonth === undefined) return null;
      day = parseInt(dayStr, 10);
      month = mappedMonth;
      if (monthFirstMatch[3]) year = parseInt(monthFirstMatch[3], 10);
    } else {
      return null;
    }
  }

  // Parse time if available (e.g., "5 PM", "17:00", "11:59 pm")
  let hours = 17; // Default deadline time to 5:00 PM IST if unspecified
  let minutes = 0;

  if (timeStr) {
    const timeMatch = timeStr
      .toLowerCase()
      .match(/^([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
    if (timeMatch) {
      const hourStr = timeMatch[1];
      if (!hourStr) return null;

      let h = parseInt(hourStr, 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3];

      if (ampm && ampm.includes('p') && h < 12) h += 12;
      if (ampm && ampm.includes('a') && h === 12) h = 0;

      hours = h;
      minutes = m;
    }
  }

  const resultDate = new Date(year, month, day, hours, minutes, 0);
  return isNaN(resultDate.getTime()) ? null : resultDate;
}

/**
 * Generates a pre-filled Google Calendar event URL.
 */
export function generateGoogleCalendarUrl(title: string, details: string, startDate: Date): string {
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  const formatCalDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

  const startStr = formatCalDate(startDate);
  const endStr = formatCalDate(endDate);

  const cleanTitle = encodeURIComponent(`[JECRC Deadline] ${title}`);
  const cleanDetails = encodeURIComponent(
    `Notification via JECRC Mail Priority Bot.\n\n${details.substring(0, 500)}`,
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${cleanTitle}&details=${cleanDetails}&dates=${startStr}/${endStr}`;
}
