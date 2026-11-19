/**
 * The brain reading an email in full (the owner, 19 Nov 2026: "it knows that
 * we've already sent the report and it's still marked outstanding and it ticks
 * it off, ... it doesn't need a text sending because they've already got the
 * email"). Called by the hourly inbox scan (lib/mail-scan.js) for each email
 * to or from a customer it matched, inbox and sent alike.
 *
 * Every one is kept whole in mail_items. Then, plainly and quietly:
 *   - a PDF we sent them that reads as their report, on a survey with no
 *     report yet, is saved on the survey; if it is not marked sent, it is
 *     marked sent with no text (jobs.report_quiet), since they have it;
 *   - our email thanking them for their payment, on a survey not paid in full,
 *     is never ticked: it becomes a question (brain_asks) on What's next.
 * Each step goes in the customer's history, so it can be seen and undone.
 */
import { query, queryOne } from './db.js';
import { storeAttachment } from './blob.js';

const GRAPH = 'https://graph.microsoft.com/v1.0/users/';
const MAX_BODY = 20000;
const MAX_PDF = 25 * 1024 * 1024;
const REPORT = /report|survey|investigation/i;
const THANKS_PAID = /thank(s| you) for (your|the) (final |balance |remaining )?payment/i;

const textOf = (html) => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
/* The email's own words, without the older ones quoted beneath. */
export const ownWords = (text) => String(text || '').split(/\n(?:From: .+\n(?:Sent|Date): |On .{6,80} wrote:|-{2,}\s*Original Message)/)[0].trim();

async function graph(path, ctx, raw = false) {
  const r = await ctx.fetchImpl(GRAPH + encodeURIComponent(ctx.mailbox) + path, { headers: { ...ctx.auth, Prefer: 'outlook.body-content-type="html"' } });
  if (!r.ok) throw new Error(`Graph ${r.status}`);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}

const history = (jobId, note, at) => query(`update jobs set sched_log = coalesce(sched_log, '[]'::jsonb) || $2::jsonb where id = $1`,
  [jobId, JSON.stringify([{ at: at || new Date().toISOString(), by: 'Brain', how: 'note', note }])]);

/** Reads one matched email whole, keeps it, and acts on what is plain. target: {kind: 'job'|'lead', id}. */
export async function mailBrain(m, target, ctx) {
  const ours = ctx.ours;
  const full = await graph(`/messages/${encodeURIComponent(m.id)}?$select=body,hasAttachments,sentDateTime`, ctx);
  const body = textOf(full.body && full.body.content);
  const files = full.hasAttachments ? ((await graph(`/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size`, ctx)).value || [])
    .filter((a) => !a.isInline).map((a) => ({ id: a.id, name: a.name, type: a.contentType, size: a.size })) : [];
  const at = (ours ? full.sentDateTime : null) || m.receivedDateTime || new Date().toISOString();
  const job = target.kind === 'job' ? await queryOne(`select id, site, customer_name, report_path, survey_sent_at, report_ready_at, paid_at, texts_off from jobs where id = $1`, [target.id]) : null;
  const did = [];
  if (job && ours) {
    const pdf = files.find((f) => /pdf/i.test(f.type || '') && REPORT.test(f.name || '') && (f.size || 0) <= MAX_PDF);
    if (pdf && !job.report_path) {
      const buf = await graph(`/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(pdf.id)}/$value`, ctx, true);
      if (buf.subarray(0, 5).toString() === '%PDF-') {
        const stored = await storeAttachment(pdf.name, 'application/pdf', buf);
        if (stored.ok) {
          await query('update jobs set report_path = $2, report_name = $3, report_at = now() where id = $1 and report_path is null', [job.id, stored.path, pdf.name]);
          did.push('report saved');
          if (!job.survey_sent_at && !job.report_ready_at) {
            await query('update jobs set survey_sent_at = $2, report_quiet = true where id = $1 and survey_sent_at is null', [job.id, at]);
            did.push('marked sent, no text');
          }
          await history(job.id, `Report ${pdf.name} found in our email "${m.subject || ''}" and saved on the survey${did.includes('marked sent, no text') ? ', marked sent with no text (they have it by email)' : ''}.`, at);
        }
      }
    }
    if (!job.paid_at && THANKS_PAID.test(ownWords(body))) {
      const asked = await queryOne(`insert into brain_asks (job_id, site, kind, say, evidence) values ($1, $2, 'looks_paid', $3, $4::jsonb)
          on conflict (job_id, kind) do nothing returning id`,
        [job.id, job.site, `Looks paid in full: our email "${m.subject || ''}" on ${String(at).slice(0, 10)} thanked them for their payment.`, JSON.stringify({ messageId: m.id, at })]);
      if (asked) did.push('asked: looks paid');
    }
  }
  await query(`insert into mail_items (message_id, at, dir, from_addr, to_addrs, subject, body, attachments, job_id, lead_id, site, action)
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12) on conflict (message_id) do nothing`,
  [m.id, at, ours ? 'out' : 'in', ctx.from, ctx.to, String(m.subject || '').slice(0, 300), body.slice(0, MAX_BODY),
    JSON.stringify(files.map(({ name, type, size }) => ({ name, type, size }))), job ? job.id : null, target.kind === 'lead' ? target.id : null,
    job ? job.site : null, did.join('; ') || null]);
  return did;
}
