/**
 * The words a phone alert is built from, so every alert reads the same way.
 *
 * Staff never see job numbers, so an alert names the job the way they talk
 * about it: the customer's first name and postcode district ("Sarah, BR6").
 * The owner has agreed that much is fine on a lock screen. Nothing more ever
 * goes in: no surname, phone, email, street or full postcode.
 *
 * Money is short (£5,630, or £5,630.50 when there are pence), dates read like
 * a diary ("Sat 18 Oct") and times like a person says them ("9:30am").
 */

const NAMES = { dampscan: 'DampScan', 'ati-london': 'ATi Damp Survey', roofing: 'Verge Roofing', ac: 'CoolRight' };
const AREAS = { dampscan: 'damp', 'ati-london': 'damp', roofing: 'roofing', ac: 'ac' };

/** The brand's name for a site key, or the key itself for one not known here. */
export const brandName = (site) => NAMES[site] || site || 'Staff area';

/** The first word of a brand, for a body that already names the customer ("Verge"). */
export const shortBrand = (name) => String(name || '').split(/\s+/)[0];

export function money(pence) {
  const p = Math.round(Number(pence) || 0);
  const whole = p % 100 === 0;
  return `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

const TITLES = /^(mr|mrs|ms|miss|mx|dr|prof|sir|rev)\.?$/i;
/* Only the first word, letters only, so a full name typed into a first-name
   box ("sarah jones") still gives just "Sarah". */
export function firstName(name) {
  const w = String(name || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '');
  /* "Mrs Patel": the next word is a surname, so there is no first name to give. */
  if (TITLES.test(w)) return '';
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
}

/** "BR6 8AB" or "br68ab" gives "BR6". A string that is not a postcode gives nothing. */
export function district(postcode) {
  const pc = String(postcode || '').toUpperCase().replace(/\s+/g, '');
  const outward = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc) ? pc.slice(0, -3) : pc;
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(outward) ? outward : '';
}

/** "Sarah, BR6", "Sarah", "a customer in BR6" or "a customer". */
export function customer(name, postcode, joiner = ', ') {
  const first = firstName(name);
  const area = district(postcode);
  if (first) return area ? `${first}${joiner}${area}` : first;
  return area ? `a customer in ${area}` : 'a customer';
}

/** "2026-10-18" gives "Sat 18 Oct". */
export function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "09:30" gives "9:30am", "14:00" gives "2pm". */
export function clock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`}${h < 12 ? 'am' : 'pm'}`;
}

/* One staff site serves every business, chosen by ?area=, so a link names
   the area and the right company opens. STAFF_URL lets a preview point its
   alerts at itself. */
/* The live site with no slash on the end (STATUS_BASE was set with one, which made // addresses that Stripe
   and Twilio were redirected away from, so their notices never arrived). Every callback and link is built on it. */
export const siteBase = () => (process.env.STATUS_BASE || 'https://dampscan.co.uk').trim().replace(/\/+$/, '');
export const staffBase = () => (process.env.STAFF_URL || 'https://dampscan.co.uk/staff').trim().replace(/\/+$/, '');
export const areaOf = (site) => AREAS[site] || null;
/* Due and the to-do list now live in Today (the calendar), so an alert that
   would have opened either opens Today, with the to-do drawer for a to-do. */
const TODAY_PAGES = { 'due.html': ['calendar.html', ''], 'todo.html': ['calendar.html', '#todo'] };
export function page(file, site, hash = '') {
  const area = areaOf(site);
  const [to, mark] = TODAY_PAGES[file] || [file, ''];
  return `/${to}${area ? `?area=${area}` : ''}${hash || mark}`;
}
/** The staff page for one job: the quoted screen, or for damp the Surveys page, which opens their customer card
    (jobs.html is Money and rates and opens no card, so an alert landed nowhere). */
export const jobPage = (site, id) => page(areaOf(site) === 'damp' ? 'surveys.html' : 'quoted.html', site, id != null ? `#job-${id}` : '');
