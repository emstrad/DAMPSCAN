/**
 * A buyer's "report needed by" date from the words the booking form writes
 * ("needed quickly (by Wed 4 Nov)"), as a date. The year is the one that
 * puts the day closest after today, so a November deadline typed in late
 * October is this year and a January one is next year.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function deadlineDate(text, today) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})/.exec(String(text || ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const year = Number(String(today).slice(0, 4));
  const iso = (y) => `${y}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  /* A date more than two months gone is next year's. */
  return Date.parse(iso(year)) < Date.parse(today) - 60 * 86400000 ? iso(year + 1) : iso(year);
}
