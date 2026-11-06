/**
 * A surveyor's own view (work level everywhere, such as Ronnie and Ben, the
 * owner's choice): Today lists only their own jobs, holds and work, never the
 * company's. Customer details elsewhere stay open to them (lib/figures.js),
 * so a survey handed over at short notice can still be reached.
 */
import { ownJobs, surveyorKey } from './figures.js';

/** True for someone who manages nothing: the surveyors' view. */
export const isWorker = (scope) => Boolean(scope) && !scope.isAdmin && !Object.values(scope.levels || {}).includes('manage');

/** Today's answer cut down to the person's own jobs. */
export async function ownDay(scope, data) {
  if (!isWorker(scope)) return data;
  const owned = await ownJobs(scope);
  const key = surveyorKey(scope.name);
  const job = (e) => (e.kind === 'job' ? owned.has(Number(e.id)) : e.jobId != null && owned.has(Number(e.jobId)));
  return {
    ...data,
    events: (data.events || []).filter(job),
    todayEvents: (data.todayEvents || []).filter(job),
    unbooked: (data.unbooked || []).filter(job),
    pencils: (data.pencils || []).filter((p) => String(p.surveyor || '').toLowerCase() === key),
    work: data.work && ownWork(data.work, owned)
  };
}

/* Their own to-dos, and only the work on their own jobs (the report to send); empty groups go. */
function ownWork(work, owned) {
  const keep = (i) => i.group === 'todos' || (i.jobId != null && owned.has(Number(i.jobId)));
  const groups = (work.groups || []).map((g) => {
    const items = (g.items || []).filter(keep);
    return { ...g, items, count: items.length };
  }).filter((g) => g.items.length);
  return { ...work, groups, total: groups.reduce((s, g) => s + g.count, 0) };
}
