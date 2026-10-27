/**
 * Who covers where, the owners' rule: Tom covers London, Ben and Ronnie
 * Kent. Anyone can still go anywhere (the team confirms every website
 * request and can hand it over), so this only decides who is tried first.
 * Areas from the postcode alone: the London districts, and Kent's ME, TN,
 * CT and its DA towns (Dartford, Swanley, Gravesend); Bexley's DA districts
 * count as London.
 */
const LONDON = new Set(['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC', 'BR', 'CR', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB']);
const KENT = new Set(['ME', 'TN', 'CT']);
const KENT_DA = new Set([1, 2, 3, 4, 9, 10, 11, 12, 13]);

export const PATCH_OF = { tom: 'london', ben: 'kent', ronnie: 'kent' };

/** 'london', 'kent' or null for a postcode. */
export function patchOf(postcode) {
  const m = /^([A-Z]{1,2})(\d{1,2})/.exec(String(postcode || '').toUpperCase().replace(/\s+/g, ''));
  if (!m) return null;
  if (m[1] === 'DA') return KENT_DA.has(Number(m[2])) ? 'kent' : 'london';
  return LONDON.has(m[1]) ? 'london' : KENT.has(m[1]) ? 'kent' : null;
}

/** Whether this surveyor covers this postcode (true when the area is unknown). */
export const covers = (surveyor, postcode) => { const p = patchOf(postcode); return !p || PATCH_OF[surveyor] === p; };
