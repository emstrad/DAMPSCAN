/**
 * When customer texts may go (lib/texts.js): never 9pm to 9am (the owner,
 * 16 Nov 2026: 7am was too early, an antisocial hour); the survey-morning text
 * from 9, or at 8:15 for a survey starting 9:00 to 9:59, since by 9 the
 * surveyor is at the door. One starting before 9 has none: its booked text said when.
 */
export const QUIET = { from: 21, until: 9 };
export const MORNING_HOUR = 9;
export const EARLY_FROM = '08:15';
const londonHm = (d) => d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
export const isEarly = (now = new Date()) => { const hm = londonHm(now); return hm >= EARLY_FROM && hm < '09:00'; };
/* The hourly run can be late (GitHub's schedule slips), so any run from 9 until
   noon sends what 9 o'clock did not; the day is the key, so it is still once. */
export const MORNING_UNTIL = 12;
