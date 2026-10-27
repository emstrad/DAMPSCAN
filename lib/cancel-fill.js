/**
 * When a survey is cancelled, moved away or handed to someone else, the gap
 * it leaves is offered to the customers still waiting on the Scheduling
 * board: the best-fit engine is asked which of them that surveyor could see
 * that day, and the owners get one alert naming the closest few, so the
 * slot is filled from the phone in a minute rather than left empty.
 */
import { board } from './scheduling.js';
import { bestFits } from './best-fit.js';
import { notify } from './notify.js';
import { customer } from './alert-words.js';
import { londonToday } from './pipeline.js';

const nice = (d, t) => `${new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}${t ? ' ' + t : ''}`;

export async function offerFreedSlot({ surveyor, date, time, site }) {
  const today = londonToday();
  if (!surveyor || !date || date <= today) return [];
  const sites = ['dampscan', 'ati-london'];
  const { cards } = await board(sites, today);
  if (!cards.length) return [];
  const { fits } = await bestFits(cards, sites, today, { days: 21, keep: 10, freshMax: 10 });
  const could = cards.map((c) => ({ c, o: (fits.get(c.kind + ':' + c.id) || { best: [] }).best.find((o) => o.surveyor === surveyor && o.date === date && !o.late) }))
    .filter((x) => x.o).sort((a, b) => a.o.added - b.o.added).slice(0, 3);
  if (!could.length) return [];
  await notify({ business: site, kind: 'enquiry', ref: null, tags: 'calendar', priority: 4, path: '/schedule.html',
    title: `Gap to fill: ${surveyor[0].toUpperCase() + surveyor.slice(1)}, ${nice(date, time)}`,
    message: `Could fit: ${could.map((x) => `${customer(x.c.name, x.c.postcode)} at ${x.o.time} (adds ${x.o.added} min)`).join('; ')}.` });
  return could.map((x) => ({ kind: x.c.kind, id: x.c.id, time: x.o.time }));
}
