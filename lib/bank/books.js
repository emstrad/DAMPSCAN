/**
 * Which set of bank books a business keeps, and who a line in them can be
 * split between.
 *
 * The two damp brands share one account and one set of partners, so they are
 * one set of books, 'damp', and everything the bank held before there were
 * four businesses is theirs. Each other business keeps its own: its own
 * account, its own uploads, its own learned rules, its own reconciliation.
 * Nothing is ever summed across books, because four companies with four
 * accounts and three ownerships have no combined balance that means anything.
 *
 * Split targets are per books. Damp's are the three partners and the tax pot,
 * the same four the share columns were built for. A quoted business's are the
 * people who hold a grant on it, keyed by person id so a name change moves no
 * money, plus its own tax pot.
 */
import { query } from '../db.js';

export const DAMP_BOOKS = 'damp';
const DAMP_SITES = ['dampscan', 'ati-london'];
const DAMP_NAME = 'DampScan and ATi';
const DAMP_TARGETS = [
  { key: 'scott', name: 'Scott' }, { key: 'tom', name: 'Tom' }, { key: 'ben', name: 'Ben' }, { key: 'tax', name: 'Tax pot' }
];
const TAX = { key: 'tax', name: 'Tax pot' };

/** The books a business's money is kept in. */
export function booksFor(site) {
  return DAMP_SITES.includes(site) ? DAMP_BOOKS : site;
}

export const personKey = (id) => `p${Number(id)}`;

export function personIdOf(key) {
  const m = /^p(\d+)$/.exec(String(key || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Every set of books the viewer's scope reaches, damp first, each with the
 * businesses in it and the targets a line there can be split between.
 */
export async function listBooks(scope) {
  const businesses = await query(
    'select slug, name, payout_model from businesses where active and slug = any($1::text[]) order by slug',
    [scope.businesses]
  );
  const out = new Map();
  for (const b of businesses) {
    const key = booksFor(b.slug);
    if (!out.has(key)) {
      out.set(key, {
        key,
        name: key === DAMP_BOOKS ? DAMP_NAME : b.name,
        model: key === DAMP_BOOKS ? 'damp' : b.payout_model,
        sites: [],
        targets: []
      });
    }
    out.get(key).sites.push(b.slug);
  }
  for (const books of out.values()) {
    if (books.key === DAMP_BOOKS) { books.targets = DAMP_TARGETS.slice(); continue; }
    const people = await query(
      `select distinct p.id, p.name from people p join grants g on g.person_id = p.id
        where p.active and g.business_slug = any($1::text[]) order by p.name, p.id`,
      [books.sites]
    );
    books.targets = [...people.map((p) => ({ key: personKey(p.id), name: p.name, personId: Number(p.id) })), TAX];
  }
  return [...out.values()].sort((a, b) => {
    if (a.key === DAMP_BOOKS) return -1;
    if (b.key === DAMP_BOOKS) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The importer's guess names a partner by first name, which is the key in
 * damp's books and a lookup in the others. One person of that name on the
 * business is them; nobody, or two, and the line waits for a person.
 */
export function translateSplit(split, books) {
  if (books.key === DAMP_BOOKS) return split;
  const out = [];
  for (const key of split) {
    if (key === 'tax') { out.push('tax'); continue; }
    const hit = books.targets.filter((t) => t.personId && t.name.toLowerCase().split(/\s+/)[0] === key);
    if (hit.length !== 1) return [];
    out.push(hit[0].key);
  }
  return out;
}
