/**
 * A customer added on Scheduling by hand, usually while they are on the
 * phone. They become an enquiry card like a website one (so booking, holds,
 * history and Leads all work the same), marked as a phone call so the
 * website's figures can tell them apart. Starts in Contacted: they rang us.
 * The same phone or email already open on the board is offered back instead
 * of making a second card, unless the person says it is someone else.
 */
import { query, queryOne } from './db.js';
import { DAMP } from './scheduling.js';
import { sameParams, sameSql, LEAD, JOB } from './same-person.js';

export async function createCard(scope, body, by) {
  const site = String(body.site || '');
  if (!DAMP.includes(site) || !scope.businesses.includes(site)) return { error: 'Pick ATi or DampScan.' };
  const name = String(body.name || '').trim().slice(0, 80);
  const postcode = String(body.postcode || '').trim().toUpperCase().slice(0, 10);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
  /* From an email (ChatGPT's inbox sweep) the card is made with what the email
     gives: a postcode can follow, so nobody is lost for want of one. */
  const byEmail = body.how === 'email';
  if (!name) return { error: 'Give their name.' };
  if (!postcode && !byEmail) return { error: 'Give their postcode, so the best times can be worked out.' };
  if (!phone && !email) return { error: 'Give a phone number or an email.' };
  if (body.force !== true) {
    /* The same person already on the board (lib/same-person.js: email, phone, or first name and postcode). */
    const same = await queryOne(`select 'lead' as kind, l.id, l.first_name as name, l.postcode from leads l
        where l.site = $1 and l.closed_at is null and l.stage = 'complete' and not exists (select 1 from jobs j where j.lead_id = l.id)
          and ${sameSql(LEAD('l'), 2)}
       union all
       select 'job', j.id, coalesce(j.customer_name, l.first_name), coalesce(j.customer_postcode, l.postcode) from jobs j left join leads l on l.id = j.lead_id
        where j.site = $1 and j.status = 'booked' and ${sameSql(JOB('j', 'l'), 2)}
       limit 1`, [site, ...sameParams({ email, phone, name, postcode })]);
    if (same) return { same: { kind: same.kind, id: Number(same.id), name: same.name, postcode: same.postcode } };
  }
  const said = String(body.note || '').trim().slice(0, 1000);
  const entry = byEmail
    ? { at: new Date().toISOString(), by, how: 'email', dir: 'in', note: said ? `They emailed: ${said}` : 'They emailed.' }
    : { at: new Date().toISOString(), by, how: 'call', note: said ? `They rang: ${said}` : 'They rang.' };
  /* An emailed enquiry starts in New (nobody has answered yet); a caller has been spoken to. */
  const row = await queryOne(`insert into leads (site, stage, first_name, postcode, phone, email, address_line1, notes, session_id, source_path, sched_stage, sched_log)
      values ($1, 'complete', $2, $3, $4, $5, $6, $7, gen_random_uuid(), $9, $10, $8::jsonb) returning id`,
    [site, name, postcode || '', phone || null, email, String(body.address || '').trim().slice(0, 200) || null, said || null, JSON.stringify([entry]),
      byEmail ? 'email' : 'phone', byEmail ? 'new' : 'contacted']);
  return { ok: true, kind: 'lead', id: Number(row.id) };
}
