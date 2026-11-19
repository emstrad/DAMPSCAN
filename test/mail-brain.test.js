/**
 * The brain reading an email whole (lib/mail-brain.js), with a pretend Microsoft
 * mailbox and file store: our email carrying their report saves it on the
 * survey and marks it sent with no text; our "thank you for your payment" only
 * asks; their email is kept; each email is kept once.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });
const stored = [];
mock.module('../lib/blob.js', { namedExports: { storeAttachment: async (name) => { stored.push(name); return { ok: true, path: `leads/2026-11-19/00000000-0000-4000-8000-000000000000-${name}` }; } } });

const { mailBrain, ownWords } = await import('../lib/mail-brain.js');

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, mail_items, brain_asks restart identity cascade'); stored.length = 0; });
after(async () => { await pool.end(); });

const PDF = Buffer.from('%PDF-1.7 a report');
function mailbox({ html, files = [] }) {
  return async (url) => {
    const u = String(url);
    if (u.endsWith('/$value')) return { ok: true, arrayBuffer: async () => PDF };
    if (u.includes('/attachments')) return { ok: true, json: async () => ({ value: files }) };
    return { ok: true, json: async () => ({ body: { content: html }, hasAttachments: files.length > 0, sentDateTime: '2026-11-17T16:28:34Z' }) };
  };
}
const ctx = (fetchImpl, ours = true) => ({ ours, auth: {}, mailbox: 'tom@atidampsurvey.co.uk', fetchImpl, from: ours ? 'tom@atidampsurvey.co.uk' : 'anne@x.com', to: ours ? ['anne@x.com'] : ['tom@atidampsurvey.co.uk'] });
async function job(o = {}) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, customer_email, survey_type, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b, date_set, job_date, texts_off, paid_at)
    values ('dampscan', 'completed', 'Anne Adams', 'CT5 1HZ', 'anne@x.com', 'dt-full-house', 44500, 'tom', 0, 0, '', '', '', true, '2026-11-14', true, $1) returning id`, [o.paid || null])).rows[0].id);
}

test('our email with their report: saved on the survey, marked sent with no text, in their history; kept once', async () => {
  const id = await job({ paid: '2026-11-17T12:00:00Z' });
  const f = mailbox({ html: '<p>Hi Ross and Anne,</p><p>Attached is your full survey report.</p>', files: [{ id: 'a1', name: 'ATI_Damp_Investigation_Report_83_Victoria_Street.pdf', contentType: 'application/pdf', size: 900 }] });
  const did = await mailBrain({ id: 'm1', subject: 'Re: Damp Survey 83 Victoria Street', receivedDateTime: '2026-11-17T16:28:36Z' }, { kind: 'job', id }, ctx(f));
  assert.deepEqual(did, ['report saved', 'marked sent, no text']);
  const j = (await pool.query('select report_name, survey_sent_at, report_quiet, sched_log from jobs where id = $1', [id])).rows[0];
  assert.equal(j.report_name, 'ATI_Damp_Investigation_Report_83_Victoria_Street.pdf');
  assert.ok(j.survey_sent_at && j.report_quiet, 'sent, and quiet: no report text ever');
  assert.match(j.sched_log.at(-1).note, /found in our email/);
  await mailBrain({ id: 'm1', subject: 'again' }, { kind: 'job', id }, ctx(f));
  assert.equal((await pool.query('select count(*)::int as n from mail_items')).rows[0].n, 1, 'each email once');
  assert.equal(stored.length, 1, 'and the file once');
});

test('our "thank you for your payment" on an unpaid survey asks, never ticks; old quoted words do not count', async () => {
  const id = await job();
  await mailBrain({ id: 'm2', subject: 'Damp Survey' }, { kind: 'job', id }, ctx(mailbox({ html: '<p>Hi Anne, thank you for your payment. Attached is the report.</p>' })));
  const j = (await pool.query('select paid_at from jobs where id = $1', [id])).rows[0];
  assert.equal(j.paid_at, null, 'never ticked by itself');
  const [a] = (await pool.query('select kind, status, say from brain_asks where job_id = $1', [id])).rows;
  assert.deepEqual([a.kind, a.status], ['looks_paid', 'open']);
  const quoted = 'Hi, any news?\n\nFrom: ATi Damp Survey\nSent: Monday\nThank you for your payment.';
  assert.equal(ownWords(quoted), 'Hi, any news?');
});

test('their email is kept whole against them, and nothing is done', async () => {
  const id = await job();
  const did = await mailBrain({ id: 'm3', subject: 'When is the report?' }, { kind: 'job', id }, ctx(mailbox({ html: '<div>Hi Tom,<br>When can we expect the report?</div>' }), false));
  assert.deepEqual(did, []);
  const [m] = (await pool.query('select dir, body, job_id from mail_items where message_id = $1', ['m3'])).rows;
  assert.deepEqual([m.dir, Number(m.job_id)], ['in', id]);
  assert.match(m.body, /When can we expect the report\?/);
});
