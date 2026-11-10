/**
 * Forgiving customer lookup, shared by the phone's Search, ChatGPT and the
 * enquiry finder (the owners' choice, 10 Nov 2026: someone on the phone has
 * to be found at once). Each word is looked for in the name, email, phone
 * (digits only, +44 read as 0), postcode (spaces ignored) and address, and
 * a record scores one per word found. The best scorers win, so a surname
 * the enquiry never stored, a phone typed with spaces or a postcode split in
 * two still finds the person.
 */

/** The words to look for. A phone number, however typed, is one word. */
export function searchTerms(text) {
  const raw = String(text || '').trim().slice(0, 80);
  if (/^[+\d\s().-]+$/.test(raw) && raw.replace(/\D/g, '').length >= 6) {
    return [raw.replace(/\D/g, '').replace(/^44/, '0').replace(/^0?(7\d{9})$/, '0$1')];
  }
  return raw.toLowerCase().split(/[\s,]+/).map((t) => t.replace(/[^a-z0-9@.'-]/g, '')).filter((t) => t.length > 1).slice(0, 6);
}

/** One searchable string from the fields given (SQL expressions). */
export function haystack({ name, email, phone, postcode, address }) {
  return `lower(concat_ws(' ', ${name}, ${email},
    regexp_replace(regexp_replace(coalesce(${phone}, ''), '\\D', '', 'g'), '^44', '0'),
    replace(coalesce(${postcode}, ''), ' ', ''), ${address}))`;
}

/** The score for a haystack: one per word found. Params start at `from`. */
export function scoreSql(hay, terms, from) {
  return terms.map((_, i) => `(case when ${hay} like $${from + i} then 1 else 0 end)`).join(' + ') || '0';
}

export const likeParams = (terms) => terms.map((t) => `%${t.replace(/[%_\\]/g, '')}%`);

/** Only the best matches: everyone with the top score. */
export function bestOnly(rows) {
  const top = Math.max(0, ...rows.map((r) => Number(r.score) || 0));
  return top ? rows.filter((r) => Number(r.score) === top) : [];
}
