/**
 * POLINTRACK — Centralized Date & Time Formatters (TSK-20.2 / HOTFIX-TIMEZONE)
 *
 * Enforces canonical date and time display across all operational screens:
 *   - Standard table/filter date: DD/MM/YYYY (e.g. 19/09/2026)
 *   - Standard time: hh:mm a (e.g. 10:44 a. m. / 03:30 p. m.)
 *   - Detailed / drawer date: D de MMMM de YYYY (e.g. 19 de septiembre de 2026)
 *   - Timestamps / Fichas Técnicas: DD/MM/YYYY hh:mm a (e.g. 19/09/2026 10:44 a. m.)
 *
 * Distinguishes between:
 *   1. Pure Calendar Dates (YYYY-MM-DD or midnight UTC): e.g. receiptDate, productionDate, dispatchDate.
 *      Preserves exact calendar date without shifts.
 *   2. Audit Timestamps (ISO 8601 UTC instants): e.g. createdAt, executedAt, timestamp.
 *      Renders in the user's / plant's local runtime timezone (eliminating the +6h UTC discrepancy).
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
 * Formats date to canonical DD/MM/YYYY (e.g. 19/09/2026).
 *
 * - Pure calendar dates (YYYY-MM-DD) preserve the date without timezone shifting.
 * - Timestamps (with non-zero time or Date objects) format in the user's local timezone.
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';

  if (typeof dateInput === 'string') {
    // Pure calendar date YYYY-MM-DD or midnight UTC timestamp from DB (@db.Date)
    const calMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?(?:Z|[+-]00:?00)?)?$/);
    if (calMatch) {
      return `${calMatch[3]}/${calMatch[2]}/${calMatch[1]}`;
    }
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '-';

  // Format in user's local timezone
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formatea una hora garantizando que si viene en string "HH:mm", "HH:mm:ss"
 * o timestamp dummy de Prisma @db.Time ("1970-01-01T...Z"),
 * NO sufra conversiones indebidas de zona horaria (-6 horas).
 */
export function formatTime(timeInput: string | Date | null | undefined): string {
  if (!timeInput) return '—';

  // Caso 1: String de hora pura ("HH:mm", "HH:mm:ss") o timestamp dummy de Prisma @db.Time
  if (typeof timeInput === 'string') {
    const trimmed = timeInput.trim();

    // 1a. Coincide con formato "HH:mm" o "HH:mm:ss"
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const parts = trimmed.split(':');
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1];

      if (isNaN(hours)) return trimmed;

      const period = hours >= 12 ? 'p. m.' : 'a. m.';
      hours = hours % 12;
      if (hours === 0) hours = 12;

      const formattedHours = hours.toString().padStart(2, '0');
      return `${formattedHours}:${minutes} ${period}`;
    }

    // 1b. Columna @db.Time serializada por Prisma ("1970-01-01T10:00:00.000Z")
    const prismaTimeMatch = trimmed.match(
      /^(?:1970-01-01|0000-01-01|0000-00-00)T(\d{2}):(\d{2})(?::\d{2})?/
    );
    if (prismaTimeMatch) {
      let hours = parseInt(prismaTimeMatch[1], 10);
      const minutes = prismaTimeMatch[2];

      if (!isNaN(hours)) {
        const period = hours >= 12 ? 'p. m.' : 'a. m.';
        hours = hours % 12;
        if (hours === 0) hours = 12;

        const formattedHours = hours.toString().padStart(2, '0');
        return `${formattedHours}:${minutes} ${period}`;
      }
    }
  }

  // Caso 2: Objeto Date o Timestamp ISO completo (createdAt, updatedAt)
  try {
    const date = typeof timeInput === 'string' ? new Date(timeInput) : timeInput;
    if (isNaN(date.getTime())) return typeof timeInput === 'string' ? timeInput : '—';

    // Si es un Date instanciado a partir de una hora dummy de Prisma (año 1970 o 1969)
    if (date.getUTCFullYear() <= 1970 && date.getFullYear() <= 1970) {
      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      const period = hours >= 12 ? 'p. m.' : 'a. m.';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      const formattedHours = hours.toString().padStart(2, '0');
      return `${formattedHours}:${minutes} ${period}`;
    }

    return new Intl.DateTimeFormat('es-NI', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Formats date to verbose format for drawers/fichas técnicas: D de MMMM de YYYY
 * (e.g. 19 de septiembre de 2026)
 */
export function formatDateLong(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';

  if (typeof dateInput === 'string') {
    const calMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?(?:Z|[+-]00:?00)?)?$/);
    if (calMatch) {
      const year = calMatch[1];
      const monthIdx = parseInt(calMatch[2], 10) - 1;
      const day = parseInt(calMatch[3], 10);
      const monthName = MONTH_NAMES_ES[monthIdx] || calMatch[2];
      return `${day} de ${monthName} de ${year}`;
    }
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '-';

  const day = d.getDate();
  const monthName = MONTH_NAMES_ES[d.getMonth()];
  const year = d.getFullYear();

  return `${day} de ${monthName} de ${year}`;
}

export interface FormattedDateTime {
  date: string;
  time: string;
  full: string;
  toString(): string;
}

/**
 * Combined date and time formatter for audit timestamps (createdAt, updatedAt, executedAt, timestamp).
 * Always renders the instant converted to the user's local timezone.
 *
 * Example:
 *   Input: "2026-09-19T16:44:00.000Z" in local timezone UTC-6 (Nicaragua / Central America)
 *   Returns: { date: "19/09/2026", time: "10:44 a. m.", full: "19/09/2026 10:44 a. m." }
 */
export function formatDateTime(
  dateInput: string | Date | null | undefined,
  timeInput?: string | Date | null | undefined,
): FormattedDateTime {
  if (!dateInput) {
    return {
      date: '—',
      time: '',
      full: '—',
      toString() {
        return '—';
      },
    };
  }

  // If timeInput is explicitly provided (separate calendar date + separate time string)
  if (timeInput) {
    const date = formatDate(dateInput);
    const time = formatTime(timeInput);
    const validTime = time && time !== '—' ? time : '';
    const full = validTime ? `${date} ${validTime}` : date;
    return {
      date,
      time: validTime,
      full,
      toString() {
        return full;
      },
    };
  }

  // If dateInput is a pure calendar date string without time (YYYY-MM-DD)
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const date = formatDate(dateInput);
    return {
      date,
      time: '',
      full: date,
      toString() {
        return date;
      },
    };
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) {
    return {
      date: '—',
      time: '',
      full: '—',
      toString() {
        return '—';
      },
    };
  }

  // Convert to user's local timezone
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const date = `${day}/${month}/${year}`;

  const time = formatTime(d);
  const validTime = time && time !== '—' ? time : '';
  const full = validTime ? `${date} ${validTime}` : date;

  return {
    date,
    time: validTime,
    full,
    toString() {
      return full;
    },
  };
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

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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
