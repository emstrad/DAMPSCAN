/**
 * Friday money check: one alert listing the work done over a week ago that
 * has not been paid in full, so nothing slides into the weekend. Damp
 * surveys by their paid tick, quoted trades by payments against the price.
 * Once per Friday (the morning run); customers as first name and district.
 */
import { moneyCols, owedPence } from './money-sql.js';
import { query, queryOne } from './db.js';
import { notify } from './notify.js';
import { customer, money, page } from './alert-words.js';
import { TODAY } from './today.js';

export async function alertFridayMoney(now = new Date()) {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' });
  if (weekday !== 'Friday') return { skipped: 'not Friday' };
  const ref = Number(now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).replace(/-/g, ''));
  if (await queryOne(`select 1 from notifications where kind = 'friday_money' and ref = $1`, [ref])) return { skipped: 'sent' };
  const rows = await query(
    `select j.customer_name, j.customer_postcode, b.payout_model = 'damp' as damp, ${moneyCols('j')},
            coalesce(j.invoice_net_pence, 0) - coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0) as quoted_owed
       from jobs j join businesses b on b.slug = j.site and b.active
      where j.status not in ('cancelled', 'declined', 'quoted') and j.job_date <= ${TODAY} - 7 and not j.awaiting_agent
        and ((b.payout_model = 'damp' and j.paid_at is null)
          or (b.payout_model <> 'damp' and coalesce(j.invoice_net_pence, 0) > coalesce((select sum(p.amount_pence) from job_payments p where p.job_id = j.id), 0)))
      order by j.job_date limit 50`);
  /* A damp survey owes what its page says (lib/money-sql.js); quoted work, its invoice less payments. */
  const owed = rows.map((r) => ({ ...r, owed: r.damp ? owedPence(r) : Number(r.quoted_owed) })).filter((r) => r.owed > 0);
  if (!owed.length) return { sent: 0 };
  const total = owed.reduce((t, r) => t + Number(r.owed), 0);
  const names = owed.slice(0, 6).map((r) => customer(r.customer_name, r.customer_postcode)).join('; ');
  await notify({ business: null, kind: 'friday_money', ref, tags: 'moneybag', priority: 3, path: page('calendar.html', null),
    title: `Friday money check: ${owed.length} unpaid, ${money(total)}`,
    message: `Done over a week ago and not paid in full: ${names}${owed.length > 6 ? ', and more' : ''}. Ask ChatGPT "who still needs to pay" for chasers.` });
  return { sent: owed.length };
}
