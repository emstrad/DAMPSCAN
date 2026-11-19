/**
 * Verge Roofing and CoolRight on What's next: they keep their own workflow
 * (never merged with the damp journey), so their outstanding items from the
 * shared to-do list (lib/work.js) join as one row per job in Your move.
 */
import { actionsFor } from './work.js';

const DAMP = ['dampscan', 'ati-london'];

export async function otherRows(scope, managed) {
  const sites = managed.filter((s) => !DAMP.includes(s));
  if (!sites.length) return [];
  const work = await actionsFor(scope, sites);
  const by = new Map();
  for (const g of work.groups) {
    if (['todos', 'payouts', 'budget'].includes(g.key)) continue;
    for (const i of g.items) {
      const key = i.jobId ? `job-${i.jobId}` : `item-${i.key}`;
      if (!by.has(key)) by.set(key, { key, kind: i.jobId ? 'job' : 'item', jobId: i.jobId || null, leadId: i.leadId || null, site: i.site, name: i.firstName, first: i.firstName,
        postcode: i.postcode, phone: i.phone || null, stage: g.label, lane: i.overdue ? 'now' : 'us', next: i.what, why: g.label, since: i.date ? `${String(i.date).slice(0, 10)}T09:00:00Z` : null, action: 'open', quoted: true, todos: [] });
    }
  }
  return [...by.values()];
}
