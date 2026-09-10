/**
 * Calculates the ISO 8601 week number and ISO week-numbering year for a given calendar date.
 *
 * Rules:
 * - Weeks start on Monday (day 1) and end on Sunday (day 7).
 * - Week 1 of any year is the week containing the first Thursday of that year (or Jan 4).
 * - Handles boundary conditions at the beginning and end of calendar years.
 *
 * @param dateInput Date instance or ISO date string (YYYY-MM-DD)
 * @returns Object with isoWeek (1..53) and isoYear
 */
export function getISOWeek(dateInput: Date | string): {
  isoWeek: number;
  isoYear: number;
} {
  const d = new Date(
    typeof dateInput === 'string' ? `${dateInput}T00:00:00.000Z` : dateInput,
  );

  // UTC Day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayOfWeek = d.getUTCDay();
  // Transform so Monday = 1, ..., Sunday = 7
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

  // Find nearest Thursday: date + 4 - isoDay
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);

  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));

  // Compute number of days from Jan 1 of isoYear to nearest Thursday
  const dayOfYear =
    Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;

  const isoWeek = Math.ceil(dayOfYear / 7);

  return { isoWeek, isoYear };
}
