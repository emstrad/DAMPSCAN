/**
 * Chasing the balance by hand from the job pop-up (the owner, 19 Nov 2026: the
 * final payment could not be chased; the automatic reminder only follows a
 * report ready text, and the fresh start took older surveys out of texts).
 * A staff change through the outbox: two minutes to undo, never at night, at
 * most once a day per survey, managers only. A survey still on the old money
 * (taken out of texts at the fresh start, jobs.texts_off) gets the Revolut
 * details and their first name as the reference instead of its page (a
 * stop-gap, businesses.old_payment_details in Settings), and goes even though
 * the fresh start took it out of texts, since a person chose to send it.
 */
import { queryOne } from './db.js';
import { queueText } from './texts.js';
import { moneyOf } from './portal-view.js';
import { mobileFor } from './messages.js';
import { oldBooking } from './text-pick.js';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const OFF = ['cancelled', 'declined', 'refunded'];

/** Can a manager chase the balance? Visited (its day has come, or surveyed or reported), something owed, a mobile. */
export function chaseable(j, m = moneyOf(j)) {
  const day = j.job_day || (j.job_date ? new Date(j.job_date).toISOString().slice(0, 10) : null);
  const visited = (Boolean(j.date_set) && Boolean(day) && day <= today()) || j.status === 'completed' || Boolean(j.survey_sent_at || j.report_ready_at);
  return ['dampscan', 'ati-london'].includes(j.site) && !OFF.includes(j.status) && visited && m.balancePence > 0 && Boolean(mobileFor(j.customer_phone));
}

/** What the job pop-up shows beside the button: the balance, which words go, and the last one asked for. */
export async function chaseView(j, m) {
  if (!chaseable(j, m)) return null;
  const old = oldBooking(j);
  const bank = old ? await queryOne('select old_payment_details from businesses where slug = $1', [j.site]) : null;
  const last = await queryOne(`select id, status, coalesce(sent_at, send_after) as at from sms_outbox where job_id = $1 and kind = 'balance_hand' and status <> 'cancelled' order by created_at desc limit 1`, [j.id]);
  return { balancePence: m.balancePence, old, bankMissing: old && !(bank && bank.old_payment_details), last: last ? { id: Number(last.id), status: last.status, at: last.at } : null };
}

export async function chaseBalance(id, by) {
  const j = await queryOne(`select j.*, j.job_date::text as job_day,
      coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id and p.label <> 'refund'), 0)
        + coalesce((select sum(b.amount_pence) from bank_transactions b where b.job_id = j.id and b.amount_pence > 0), 0) as paid_pence
    from jobs j where j.id = $1`, [id]);
  if (!j || !['dampscan', 'ati-london'].includes(j.site)) return { error: 'not_found' };
  const v = await chaseView(j, moneyOf(j));
  if (!v) return { error: 'Nothing to chase: paid, not visited yet, or no mobile.' };
  if (v.bankMissing) return { error: 'Add the Revolut details first: Settings, Bank details, ATi and DampScan.' };
  const row = await queueText({ kind: 'balance_hand', site: j.site, jobId: j.id, key: 'hand-' + today(), delayMs: 120000, by, payload: { hand: true } });
  if (!row) return { error: 'Already sent or stopped today.' };
  return { ok: true, textId: Number(row.id) };
}
