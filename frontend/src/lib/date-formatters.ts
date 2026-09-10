/**
 * POLINTRACK — Centralized Date & Time Formatters (TSK-20.2)
 *
 * Enforces canonical date display across all 5 operational screens:
 *   - Standard table/filter date: DD/MM/YYYY (e.g. 04/09/2026)
 *   - Standard time: hh:mm a (e.g. 03:30 p. m. / 09:15 a. m.)
 *   - Detailed / drawer date: D de MMMM de YYYY (e.g. 4 de septiembre de 2026)
 *
 * Ensures timezone safety: never shifts dates due to UTC offsets.
 * Eliminates raw ISO timestamps (e.g. 2026-09-04T00:00:00.000Z) from UI.
 */

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Formats date to canonical DD/MM/YYYY (e.g. 04/09/2026)
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';

  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '-';

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formats time to canonical 12-hour format with lowercase period (e.g. 03:30 p. m. / 09:15 a. m.)
 */
export function formatTime(timeInput: string | Date | null | undefined): string {
  if (!timeInput) return '';

  if (typeof timeInput === 'string') {
    // Check if HH:MM or HH:MM:SS format
    const match = timeInput.match(/^(\d{2}):(\d{2})/);
    if (match) {
      let hour = parseInt(match[1], 10);
      const minute = match[2];
      const period = hour >= 12 ? 'p. m.' : 'a. m.';
      hour = hour % 12;
      if (hour === 0) hour = 12;
      const hourStr = String(hour).padStart(2, '0');
      return `${hourStr}:${minute} ${period}`;
    }
  }

  const d = typeof timeInput === 'string' ? new Date(timeInput) : timeInput;
  if (!d || isNaN(d.getTime())) return '';

  let hour = d.getUTCHours();
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  const period = hour >= 12 ? 'p. m.' : 'a. m.';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const hourStr = String(hour).padStart(2, '0');

  return `${hourStr}:${minute} ${period}`;
}

/**
 * Formats date to verbose format for drawers/fichas técnicas: D de MMMM de YYYY
 * (e.g. 4 de septiembre de 2026)
 */
export function formatDateLong(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';

  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = match[1];
      const monthIdx = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const monthName = MONTH_NAMES_ES[monthIdx] || match[2];
      return `${day} de ${monthName} de ${year}`;
    }
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '-';

  const day = d.getUTCDate();
  const monthName = MONTH_NAMES_ES[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  return `${day} de ${monthName} de ${year}`;
}

/**
 * Combined date and time formatter
 */
export function formatDateTime(
  dateInput: string | Date | null | undefined,
  timeInput?: string | Date | null | undefined,
): { date: string; time: string; full: string } {
  const date = formatDate(dateInput);
  const time = formatTime(timeInput || dateInput);
  const full = time ? `${date} ${time}` : date;
  return { date, time, full };
}

/**
 * Extracts a normalized calendar date string (YYYY-MM-DD) from a string, ISO timestamp, or Date object.
 * Safe against timezone shifts and ISO format variations.
 */
export function getCalendarDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '';

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's calendar date in YYYY-MM-DD.
 * Resolves to the later of local client date and UTC date to avoid false future-date blocks across timezones.
 */
export function getTodayCalendarDate(): string {
  const now = new Date();
  const localStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const utcStr = now.toISOString().split('T')[0];
  return localStr > utcStr ? localStr : utcStr;
}

