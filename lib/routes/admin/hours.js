/**
 * /api/admin/hours
 *
 *   GET  ?from=&to=[&surveyor=]   hours set (your own; managers may ask for anyone)
 *   GET  ?view=slots              the free times the website would offer (managers: the Lab)
 *   POST {op:'add', date, start, end[, surveyor]}
 *   POST {op:'remove', id}
 *   POST {op:'usual'}             weekends and weekday evenings for four weeks
 *   POST {op:'bulk', dates[], action: add|replace|off|usual, start, end}
 *   POST {op:'remove_window', date, start, end}
 *   POST {op:'set_usual', weekdays[], windows[{start,end}]}   the usual week
 *   POST {op:'learn'}             the usual week from the days set lately
 *   POST {op:'flag', key, enabled} a Lab switch (managers)
 *   GET  ?view=portal&q=name       surveys to make a portal link for (Lab, managers)
 *   POST {op:'portal', id}         a fresh portal link for one survey (Lab, managers)
 *
 * Everyone sets their own hours; a manager or the owners' code may set
 * anyone's. Ronnie, who works on a business, sets only his own.
 */
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope } from '../../access.js';
import { londonToday } from '../../pipeline.js';
import { SURVEYORS } from '../../splits.js';
import { surveyorOf, listHours, addHours, removeHours, addUsual, freeSlots, labFlag, setLabFlag } from '../../availability.js';
import { bulk, removeWindow, usualWeek, setUsual, learnUsual } from '../../hours-store.js';
import { dayTimes } from '../../web-booking.js';
import { priceList } from '../../../content/prices.js';
import { portalSearch, issuePortal } from '../../portal.js';

export const config = { runtime: 'nodejs' };

const DAMP = ['dampscan', 'ati-london'];
const manages = (scope) => scope.isAdmin || DAMP.some((s) => (scope.levels || {})[s] === 'manage');

/* Whose hours this request is about: your own, or anyone's for a manager. */
function whose(scope, asked) {
  const me = surveyorOf(scope);
  const want = String(asked || '').trim().toLowerCase() || me;
  if (!want || !SURVEYORS.includes(want)) return { error: 'Say whose hours: ' + SURVEYORS.join(', ') + '.' };
  if (want !== me && !manages(scope)) return { error: 'You can only set your own hours.' };
  return { surveyor: want };
}

const plusDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  const today = londonToday();
  try {
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      if (q.get('view') === 'portal') {
        if (!manages(scope)) return json(res, 403, { ok: false, error: 'The Lab is for the owners.' });
        return json(res, 200, { ok: true, found: await portalSearch(q.get('q')) });
      }
      if (q.get('view') === 'slots') {
        if (!manages(scope)) return json(res, 403, { ok: false, error: 'The Lab is for the owners.' });
        /* With a postcode, exactly what a customer there would be offered (lib/web-booking.js rules). */
        const pc = (q.get('postcode') || '').trim().slice(0, 10);
        const slots = pc
          ? (await dayTimes({ postcode: pc, today })).flatMap((d) => d.times.map((t) => ({ date: d.date, time: t.time, surveyor: t.surveyor })))
          : await freeSlots({ today });
        return json(res, 200, { ok: true, slots, prices: priceList(), live: await labFlag('booking_slots'), quiz: await labFlag('survey_quiz') });
      }
      const from = /^\d{4}-\d{2}-\d{2}$/.test(q.get('from') || '') ? q.get('from') : today;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(q.get('to') || '') ? q.get('to') : plusDays(from, 34);
      const all = q.get('surveyor') === 'all' && manages(scope);
      const who = all ? { surveyor: null } : whose(scope, q.get('surveyor'));
      if (who.error) return json(res, 200, { ok: true, me: surveyorOf(scope), manager: manages(scope), surveyors: SURVEYORS, hours: [], note: who.error });
      return json(res, 200, { ok: true, me: surveyorOf(scope), manager: manages(scope), surveyors: SURVEYORS, hours: await listHours(who.surveyor, from, to),
        usual: who.surveyor ? await usualWeek(who.surveyor) : [] });
    }
    const body = await readJson(req);
    if (body.op === 'portal') {
      if (!manages(scope)) return json(res, 403, { ok: false, error: 'The Lab is for the owners.' });
      const url = /^\d+$/.test(String(body.id)) ? await issuePortal(Number(body.id)) : null;
      return url ? json(res, 200, { ok: true, url }) : json(res, 404, { ok: false, error: 'No survey found.' });
    }
    if (body.op === 'flag') {
      if (!manages(scope)) return json(res, 403, { ok: false, error: 'The Lab is for the owners.' });
      if (!['booking_slots', 'survey_quiz'].includes(body.key)) return json(res, 400, { ok: false, error: 'Unknown switch.' });
      await setLabFlag(body.key, body.enabled === true);
      return json(res, 200, { ok: true });
    }
    const who = whose(scope, body.surveyor);
    if (who.error) return json(res, 400, { ok: false, error: who.error });
    let out;
    if (body.op === 'add') out = await addHours(scope, who.surveyor, str(body.date, 10), str(body.start, 5), str(body.end, 5));
    else if (body.op === 'remove') out = await removeHours(manages(scope) ? null : who.surveyor, Number(body.id));
    else if (body.op === 'usual') out = await addUsual(scope, who.surveyor, plusDays(today, 1));
    else if (body.op === 'bulk') out = await bulk(scope, who.surveyor, { dates: body.dates, action: body.action, start: str(body.start, 5), end: str(body.end, 5) });
    else if (body.op === 'remove_window') out = await removeWindow(who.surveyor, str(body.date, 10), str(body.start, 5), str(body.end, 5));
    else if (body.op === 'set_usual') out = await setUsual(who.surveyor, body.weekdays, body.windows);
    else if (body.op === 'learn') out = await learnUsual(who.surveyor, today);
    else return json(res, 400, { ok: false, error: 'unknown_op' });
    return json(res, out.error ? 400 : 200, out.error ? { ok: false, error: out.error } : out);
  } catch (err) {
    console.error('hours request failed:', err.message);
    json(res, 500, { ok: false, error: 'hours_failed' });
  }
}
