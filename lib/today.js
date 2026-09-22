/**
 * What day it is, in London.
 *
 * Every date boundary in the staff area is decided on London time and not the
 * server's. The servers run UTC, and for the hour before midnight through
 * British Summer Time the two disagree about the date: at 23:20 UTC on the
 * 19th it is already the 20th in London.
 *
 * That gap was a real fault, not a tidiness point. A job saved with no date
 * took the server's `current_date`, which London had already left, so the card
 * was filed as yesterday's and never reached the upcoming board. Somebody
 * recording a walk-in late on a summer evening simply lost it, every night
 * from late March to late October.
 *
 * SQL rather than a JavaScript date, so the comparison is made in the same
 * place and at the same instant as the query it belongs to, rather than being
 * carried there from another machine's clock.
 */
export const TODAY = `(now() at time zone 'Europe/London')::date`;

/** The same day, N days back. Used by the dashboard's range filters. */
export const daysAgo = (n) => `(${TODAY} - ${Number(n)})`;
