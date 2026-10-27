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

const digits = (p) => String(p || '').replace(/\D/g, '').replace(/^44/, '0');

export async function createCard(scope, body, by) {
  const site = String(body.site || '');
  if (!DAMP.includes(site) || !scope.businesses.includes(site)) return { error: 'Pick ATi or DampScan.' };
  const name = String(body.name || '').trim().slice(0, 80);
  const postcode = String(body.postcode || '').trim().toUpperCase().slice(0, 10);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
  if (!name) return { error: 'Give their name.' };
  if (!postcode) return { error: 'Give their postcode, so the best times can be worked out.' };
  if (!phone && !email) return { error: 'Give a phone number or an email.' };
  if (body.force !== true) {
    const d = digits(phone);
    const same = await queryOne(`select 'lead' as kind, id, first_name as name, postcode from leads
        where site = $1 and closed_at is null and stage = 'complete' and not exists (select 1 from jobs j where j.lead_id = leads.id)
          and ((length($2) > 6 and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') in ($2, '44' || substr($2, 2))) or ($3 <> '' and lower(email) = $3))
       union all
       select 'job', id, customer_name, customer_postcode from jobs
        where site = $1 and status = 'booked'
          and ((length($2) > 6 and regexp_replace(coalesce(customer_phone, ''), '\\D', '', 'g') in ($2, '44' || substr($2, 2))) or ($3 <> '' and lower(customer_email) = $3))
       limit 1`, [site, d, email]);
    if (same) return { same: { kind: same.kind, id: Number(same.id), name: same.name, postcode: same.postcode } };
  }
  const said = String(body.note || '').trim().slice(0, 1000);
  const entry = { at: new Date().toISOString(), by, how: 'call', note: said ? `They rang: ${said}` : 'They rang.' };
  const row = await queryOne(`insert into leads (site, stage, first_name, postcode, phone, email, address_line1, notes, session_id, source_path, sched_stage, sched_log)
      values ($1, 'complete', $2, $3, $4, $5, $6, $7, gen_random_uuid(), 'phone', 'contacted', $8::jsonb) returning id`,
    [site, name, postcode, phone || null, email, String(body.address || '').trim().slice(0, 200) || null, said || null, JSON.stringify([entry])]);
  return { ok: true, kind: 'lead', id: Number(row.id) };
}
