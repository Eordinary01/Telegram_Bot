/**
 * Deadline Extraction & Calendar Export Utilities for JECRC Emails.
 */

export interface ExtractedDeadline {
  deadlineText: string | null;
  date: Date | null;
  googleCalendarUrl: string | null;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Extracts a deadline date and text from email subject & snippet,
 * and generates a Google Calendar template URL if a valid date is found.
 */
export function extractDeadline(
  subject: string,
  snippet: string | null,
): ExtractedDeadline {
  const text = `${subject} ${snippet ?? ''}`;

  // Patterns matching keywords followed by date expressions
  // e.g. "deadline: 30th July", "due by 15/08/2026", "last date 25 August 5 PM"
  const deadlineRegex =
    /(?:deadline|due|last date|submit by|submission date|before)\s*(?:is|on|by|:)?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}(?:\s+[0-9]{4})?|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|\btomorrow\b|\btoday\b)(?:\s+(?:by|at)?\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?))?/i;

  const match = text.match(deadlineRegex);

  if (!match) {
    return { deadlineText: null, date: null, googleCalendarUrl: null };
  }

  const rawDateStr = match[1] ?? '';
  const rawTimeStr = match[2];
  const fullMatchedText = (match[0] ?? '').trim();

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
 * Parses relative terms ("today", "tomorrow") or date strings like "30th July", "15-08-2026".
 */
function parseRelativeOrExplicitDate(dateStr: string, timeStr?: string): Date | null {
  const now = new Date();
  const cleanDate = dateStr.toLowerCase().replace(/(st|nd|rd|th)/g, '').trim();

  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();

  if (cleanDate === 'today') {
    // Keep today's Y/M/D
  } else if (cleanDate === 'tomorrow') {
    day += 1;
  } else {
    // Try DD/MM/YYYY or DD-MM-YYYY
    const numericMatch = cleanDate.match(/^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2,4})$/);
    if (numericMatch) {
      const dayStr = numericMatch[1];
      const monthStr = numericMatch[2];
      const yearStr = numericMatch[3];
      if (!dayStr || !monthStr || !yearStr) return null;

      day = parseInt(dayStr, 10);
      month = parseInt(monthStr, 10) - 1;
      let yr = parseInt(yearStr, 10);
      if (yr < 100) yr += 2000;
      year = yr;
    } else {
      // Try "30 July" or "30 July 2026"
      const textMatch = cleanDate.match(/^([0-9]{1,2})\s+([a-z]{3,9})(?:\s+([0-9]{4}))?$/);
      if (textMatch) {
        const dayStr = textMatch[1];
        const monthName = textMatch[2];
        if (!dayStr || !monthName) return null;

        day = parseInt(dayStr, 10);
        const mappedMonth = MONTH_MAP[monthName];
        if (mappedMonth !== undefined) {
          month = mappedMonth;
        } else {
          return null;
        }
        const yearStr = textMatch[3];
        if (yearStr) {
          year = parseInt(yearStr, 10);
        }
      } else {
        return null;
      }
    }
  }

  // Parse time if available (e.g., "5 PM", "17:00", "11:59 pm")
  let hours = 17; // Default deadline time to 5:00 PM IST if unspecified
  let minutes = 0;

  if (timeStr) {
    const timeMatch = timeStr.toLowerCase().match(/^([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
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
export function generateGoogleCalendarUrl(
  title: string,
  details: string,
  startDate: Date,
): string {
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  const formatCalDate = (d: Date) =>
    d.toISOString().replace(/-|:|\.\d\d\d/g, '');

  const startStr = formatCalDate(startDate);
  const endStr = formatCalDate(endDate);

  const cleanTitle = encodeURIComponent(`[JECRC Deadline] ${title}`);
  const cleanDetails = encodeURIComponent(`Notification via JECRC Mail Priority Bot.\n\n${details.substring(0, 500)}`);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${cleanTitle}&details=${cleanDetails}&dates=${startStr}/${endStr}`;
}
