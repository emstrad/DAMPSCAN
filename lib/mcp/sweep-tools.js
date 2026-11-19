/**
 * The scheduled inbox sweep and its morning brief (the owner, 19 Nov 2026):
 *   sweep_done     the sweep says it finished and what it did, so What's next,
 *                  Settings and the brief can say when it last ran (a sweep that
 *                  silently stopped is worse than none);
 *   morning_brief  every figure the ATi morning brief page shows, from the same
 *                  sources as the app (lib/overnight.js, What's next, the diary,
 *                  still to pay), so the page can never disagree with it.
 * Managers only. Customers by first name and postcode district.
 */
import { query } from '../db.js';
import { callRoute, read, write, fail, canManage } from './shared.js';
import { overnight } from '../overnight.js';
import { beat } from '../heartbeat.js';
import { londonToday } from '../pipeline.js';
import todos from '../routes/admin/todos.js';

const DAMP = ['dampscan', 'ati-london'];
const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
const managed = (scope) => DAMP.filter((s) => (scope.businesses || []).includes(s) && canManage(scope, s));
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'Customer';
const district = (pc) => String(pc || '').trim().split(/\s+/)[0].toUpperCase();
const n = (v) => Math.max(0, Math.round(Number(v) || 0));

async function sweepDone(scope, { emails_read: read_, cards_added: added, emails_filed: filed, needs_you: needs, problem }) {
  if (!managed(scope).length) return fail('The sweep reports to the managers.');
  const said = problem ? `Stopped: ${String(problem).slice(0, 200)}` : `${n(read_)} email${n(read_) === 1 ? '' : 's'} read, ${n(filed)} filed, ${n(added)} new card${n(added) === 1 ? '' : 's'}${n(needs) ? `, ${n(needs)} for you` : ''}.`;
  await query(`insert into check_runs (name, at, ok, said, facts) values ('inbox_sweep', now(), $1, $2, $3::jsonb)
      on conflict (name) do update set at = now(), ok = excluded.ok, said = excluded.said, facts = excluded.facts`,
  [!problem, said, JSON.stringify({ read: n(read_), filed: n(filed), added: n(added), needs: n(needs), by: scope.name || null })]);
  await beat('inbox_sweep').catch(() => {});
  return ok({ said: `Recorded: ${said}` });
}

async function morningBrief(scope) {
  const sites = managed(scope);
  if (!sites.length) return fail('The morning brief is for managers.');
  const today = londonToday();
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const [night, next, diary, owed] = await Promise.all([
    overnight(sites),
    callRoute(todos, scope, { url: '/api/admin/todos?view=next' }),
    query(`select j.job_date::text as day, to_char(j.job_time, 'HH24:MI') as time, j.customer_name, j.customer_postcode, j.surveyor, j.site,
          j.deposit_paid_at is not null or j.paid_at is not null as deposit_in, j.awaiting_agent
        from jobs j where j.site = any($1::text[]) and j.status = 'booked' and coalesce(j.date_set, true) and j.job_date in ($2::date, $3::date)
        order by j.job_date, j.job_time nulls last`, [sites, today, tomorrow]),
    query(`select count(*)::int as n from jobs j where j.site = any($1::text[]) and j.status in ('booked', 'completed') and j.paid_at is null
        and j.job_date < $2::date`, [sites, today])
  ]);
  const rows = (next.data && next.data.rows) || [];
  const person = (r) => `${first(r.name)}${r.postcode ? ', ' + district(r.postcode) : ''}`;
  return ok({
    date: today,
    last24: night,
    needsYouNow: rows.filter((r) => r.lane === 'now').map((r) => ({ who: person(r), next: r.next, why: r.why || null, question: r.ask ? r.ask.say : null })),
    counts: next.data && next.data.counts,
    surveys: diary.map((d) => ({ day: d.day === today ? 'Today' : 'Tomorrow', time: d.time, who: `${first(d.customer_name)}${d.customer_postcode ? ', ' + district(d.customer_postcode) : ''}`,
      surveyor: d.surveyor ? d.surveyor[0].toUpperCase() + d.surveyor.slice(1) : null, depositIn: d.deposit_in, agent: d.awaiting_agent })),
    visitedNotPaid: owed[0] ? owed[0].n : 0,
    owedFromThem: rows.filter((r) => r.owedPence > 0 && ['us', 'now', 'them'].includes(r.lane)).map((r) => ({ who: person(r), owed: `£${(r.owedPence / 100).toFixed(r.owedPence % 100 ? 2 : 0)}`, next: r.next })),
    tip: 'Build the page only from these figures. Sections in this order: Needs you now, Today and tomorrow, Money, Last 24 hours, Checks (each with its state; all ok reads "All sweet").'
  });
}

export const SWEEP_TOOLS = [
  write('sweep_done', 'Inbox sweep finished', 'The scheduled inbox sweep says it has finished and what it did, so What\'s next, Settings and the morning brief show when it last ran. problem: why it stopped, if it could not finish.',
    { emails_read: { type: 'integer' }, emails_filed: { type: 'integer' }, cards_added: { type: 'integer' }, needs_you: { type: 'integer', description: 'How many emails asked for something a person must do.' }, problem: { type: 'string' } },
    [], sweepDone, { records: true }),
  read('morning_brief', 'Morning brief', 'Every figure for the ATi morning brief, from the same sources as the staff area: Needs you now, today\'s and tomorrow\'s surveys (first name and district, time, surveyor, deposit in), money owed, the last 24 hours (enquiries by source, money in, booked, reports, emails filed, texts) and every check (hourly run, card payments against Stripe, inbox sweep, email reading). Managers only.',
    {}, morningBrief)
];
