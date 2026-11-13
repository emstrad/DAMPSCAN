/**
 * /api/admin/texts: the Texts page (managers of ATi or DampScan).
 *
 *   GET                         waiting texts, the last ones sent, the wording, and whether texts are live
 *   POST {op:'flush'}           send any whose two minutes are up (the staff app calls this after a change)
 *   POST {op:'send', id}        send a waiting text now
 *   POST {op:'cancel', id}      stop a waiting text
 *   POST {op:'edit', id, body}  change a waiting text's words (just that one)
 *   POST {op:'template', kind, site, body}   the wording for one kind and brand ('' goes back to the starting words)
 */
import { json, requireMethod, readJson, str } from '../../http.js';
import { requireScope } from '../../access.js';
import { query, queryOne } from '../../db.js';
import { flushDue, wordsFor, textsLive, senderFor } from '../../texts.js';
import { KINDS, DEFAULTS, FILL_INS, segments, sampleVars } from '../../text-words.js';
import { DAMP_BRANDS } from '../../survey-messages.js';

export const config = { runtime: 'nodejs' };
const DAMP = ['dampscan', 'ati-london'];

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  const scope = await requireScope(req, res);
  if (!scope) return;
  const sites = DAMP.filter((s) => scope.isAdmin || scope.levels[s] === 'manage');
  if (req.method === 'POST') {
    const body = await readJson(req);
    if (body.op === 'flush') return json(res, 200, { ok: true, sent: await flushDue({ limit: 10 }) });
    if (!sites.length) return json(res, 403, { ok: false, error: 'forbidden' });
    const row = body.id ? await queryOne('select * from sms_outbox where id = $1 and site = any($2::text[])', [Number(body.id), sites]) : null;
    if (body.op === 'send' && row && row.status === 'waiting') {
      await query("update sms_outbox set send_after = now(), created_by = coalesce(created_by, $2) where id = $1", [row.id, scope.name || null]);
      await flushDue({ limit: 5 });
      return json(res, 200, { ok: true });
    }
    if (body.op === 'cancel' && row && row.status === 'waiting') {
      await query("update sms_outbox set status = 'cancelled', error = $2 where id = $1", [row.id, `Stopped by ${scope.name || 'staff'}.`]);
      return json(res, 200, { ok: true });
    }
    if (body.op === 'edit' && row && row.status === 'waiting') {
      const words = (str(body.body, 640) || '').trim();
      await query('update sms_outbox set body = $2 where id = $1', [row.id, words || null]);
      return json(res, 200, { ok: true });
    }
    if (body.op === 'template' && KINDS[body.kind] && sites.includes(body.site)) {
      const words = (str(body.body, 640) || '').trim();
      if (!words || words === DEFAULTS[body.kind]) await query('delete from sms_templates where kind = $1 and site = $2', [body.kind, body.site]);
      else await query(`insert into sms_templates (kind, site, body, updated_by) values ($1, $2, $3, $4)
          on conflict (kind, site) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now()`, [body.kind, body.site, words, scope.name || null]);
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { ok: false, error: 'bad_op' });
  }
  if (!sites.length) return json(res, 403, { ok: false, error: 'forbidden' });
  const NAME = `coalesce(j.customer_name, l.first_name)`;
  const rows = await query(`select o.*, ${NAME} as name, coalesce(j.customer_postcode, l.postcode) as postcode from sms_outbox o
      left join jobs j on j.id = o.job_id left join leads l on l.id = coalesce(o.lead_id, j.lead_id)
      where o.site = any($1::text[]) and (o.status in ('waiting', 'sending') or o.created_at > now() - interval '30 days')
      order by case when o.status = 'waiting' then 0 else 1 end, o.send_after desc limit 150`, [sites]);
  const out = [];
  for (const r of rows) {
    const words = r.status === 'waiting' ? await wordsFor(r).catch(() => r.body || '') : r.body || '';
    out.push({ id: Number(r.id), site: r.site, kind: r.kind, label: KINDS[r.kind] ? KINDS[r.kind].label : r.kind, status: r.status, delivery: r.delivery, error: r.error,
      name: r.name, postcode: r.postcode, jobId: r.job_id == null ? null : Number(r.job_id), leadId: r.lead_id == null ? null : Number(r.lead_id),
      sendAfter: r.send_after, sentAt: r.sent_at, edited: Boolean(r.body) && r.status === 'waiting', words, segments: segments(words), by: r.created_by });
  }
  const saved = await query('select kind, site, body, updated_by, updated_at from sms_templates where site = any($1::text[])', [sites]);
  const wording = [];
  for (const site of sites) for (const k of Object.keys(KINDS)) {
    const own = saved.find((t) => t.kind === k && t.site === site);
    wording.push({ kind: k, site, n: KINDS[k].n, label: KINDS[k].label, when: KINDS[k].when, body: own ? own.body : DEFAULTS[k], own: Boolean(own), by: own ? own.updated_by : null });
  }
  json(res, 200, { ok: true, live: textsLive(), test: Boolean(process.env.SMS_TEST_TO), senders: Object.fromEntries(sites.map((s) => [s, Boolean(senderFor(s))])),
    texts: out, wording, fillIns: FILL_INS,
    /* For the phone preview: the name it comes from and what each fill-in looks like. */
    brands: Object.fromEntries(sites.map((s) => [s, { name: DAMP_BRANDS[s].name, from: senderFor(s) || DAMP_BRANDS[s].name, sample: sampleVars(s, DAMP_BRANDS[s]) }])) });
}
