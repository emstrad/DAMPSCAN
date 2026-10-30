/**
 * The owners want the morning run at 06:30 and the evening run at 17:00
 * London time all year, but scheduled jobs run on UTC. Each run is scheduled
 * at both UTC hours (vercel.json, with ?utc=H on the path) and only the one
 * that lands on London's hour goes ahead. The test uses the London offset,
 * not the clock's hour, because the plan may start a run late in its hour.
 */

/** Hours London is ahead of UTC at `now`: 0 in winter, 1 in summer. */
export function londonOffset(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return (h - now.getUTCHours() + 24) % 24;
}

/** True when this run should go ahead; a call without ?utc= (by hand) always does. */
export function rightHour(req, londonHour, now = new Date()) {
  const utc = new URL(req.url || '/', 'http://x').searchParams.get('utc');
  if (utc == null || utc === '') return true;
  return (Number(utc) + londonOffset(now)) % 24 === londonHour;
}
