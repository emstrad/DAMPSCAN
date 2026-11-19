/**
 * A new customer's email becomes their card (lib/mail-cards.js through the
 * hourly scan): Michael's email makes one card in New, started at the email's
 * own time, with his number and postcode; his next email lands on that card;
 * our own mail, a newsletter, a company mailer, junk and an estate agent on
 * file never make one.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { scanMail } = await import('../lib/mail-scan.js');
const { looksLikeCustomer, nameOf } = await import('../lib/mail-cards.js');

const ENV = { M365_TENANT_ID: 't', M365_CLIENT_ID: 'c', M365_CLIENT_SECRET: 's', M365_MAILBOX: 'tom@atidampsurvey.co.uk' };
before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); Object.assign(process.env, ENV); });
beforeEach(async () => { await pool.query('truncate jobs, leads, mail_seen, mail_items, estate_agents, notifications, audit restart identity cascade'); });
after(async () => { for (const k of Object.keys(ENV)) delete process.env[k]; await pool.end(); });

const NOW = new Date('2026-11-19T12:00:00Z');
const mail = (id, from, subject, preview, o = {}) => ({ id, subject, bodyPreview: preview, from: { emailAddress: { address: from, name: o.name || '' } },
  toRecipients: [{ emailAddress: { address: 'tom@atidampsurvey.co.uk' } }], receivedDateTime: o.at || '2026-11-19T09:14:00Z', parentFolderId: o.folder || 'inbox', inferenceClassification: o.cls || 'focused' });
function mailbox(msgs) {
  return async (url) => {
    const u = String(url);
    if (u.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'x' }) };
    if (u.includes('/mailFolders/junkemail')) return { ok: true, json: async () => ({ id: 'junk' }) };
    if (u.includes('/mailFolders/')) return { ok: true, json: async () => ({ id: 'bin' }) };
    if (/\/messages\/[^?]+\?/.test(u)) return { ok: true, json: async () => ({ body: { content: '<p>Hi, we have damp in the back bedroom.</p>' }, hasAttachments: false }) };
    return { ok: true, json: async () => ({ value: msgs }) };
  };
}

test('Michael\'s email makes his card straight away, at the email\'s time; his next one lands on it', async () => {
  const msgs = [mail('a1', 'michael.brown@gmail.com', 'Damp survey please', 'Hi, we are buying a flat at SE9 1AA, can you call me on 07700 900123?', { name: 'Michael Brown' })];
  assert.deepEqual(await scanMail({ fetchImpl: mailbox(msgs), now: NOW }), { logged: 1, made: 1 });
  const [l] = (await pool.query('select first_name, email, phone, postcode, site, sched_stage, source_path, created_at, sched_log from leads')).rows;
  assert.deepEqual([l.first_name, l.email, l.phone, l.postcode, l.site, l.sched_stage, l.source_path], ['Michael Brown', 'michael.brown@gmail.com', '07700900123', 'SE9 1AA', 'ati-london', 'new', 'email']);
  assert.equal(l.created_at.toISOString(), '2026-11-19T09:14:00.000Z', 'the card starts when he emailed');
  assert.match(l.sched_log[0].note, /They emailed: Damp survey please/);
  const [n] = (await pool.query('select title, message from notifications')).rows;
  assert.match(n.title, /New enquiry by email/);
  assert.doesNotMatch(n.message, /Damp survey please|07700/, 'first name and district only');
  assert.equal((await pool.query('select count(*)::int as n from mail_items where lead_id is not null')).rows[0].n, 1, 'his email kept whole on his card');

  await scanMail({ fetchImpl: mailbox([...msgs, mail('a2', 'michael.brown@gmail.com', 'Re: survey', 'Any time Tuesday works', { at: '2026-11-19T10:00:00Z' })]), now: NOW });
  assert.equal((await pool.query('select count(*)::int as n from leads')).rows[0].n, 1, 'never a second card');
});

test('no card for our own mail, a newsletter, a mailer, junk, other mail, an estate agent on file or an old email', async () => {
  await pool.query(`insert into estate_agents (name, email) values ('Foxes', 'sales@foxes.co.uk')`);
  const msgs = [
    mail('b1', 'scott@dampscan.co.uk', 'Survey for Kim', 'See the damp report'),
    mail('b2', 'deals@shop.com', 'Damp-proof paint sale', 'Huge savings. Unsubscribe here'),
    mail('b3', 'noreply@stripe.com', 'Payment received', 'A payment of £150 for the survey'),
    mail('b4', 'lucky@spam.biz', 'Your house survey prize', 'Claim now', { folder: 'junk' }),
    mail('b5', 'friend@gmail.com', 'Party', 'See you at the house on Saturday', { cls: 'other' }),
    mail('b6', 'sales@foxes.co.uk', 'Survey for our buyer', 'Can you survey 1 High Street ME19 6AB'),
    mail('b7', 'old@gmail.com', 'Damp survey', 'Please call me', { at: '2026-10-25T09:00:00Z' })
  ];
  assert.deepEqual(await scanMail({ fetchImpl: mailbox(msgs), now: NOW }), { logged: 0, made: 0 });
  assert.equal((await pool.query('select count(*)::int as n from leads')).rows[0].n, 0);
});

test('a name from the address when none is given; only mail about a home counts', () => {
  assert.equal(nameOf('', 'michael.brown88@gmail.com'), 'Michael Brown');
  assert.equal(nameOf('"Sarah Jones"', 's@x.com'), 'Sarah Jones');
  assert.equal(looksLikeCustomer({ subject: 'Hello', bodyPreview: 'Lunch?' }, 'a@gmail.com'), false);
  assert.equal(looksLikeCustomer({ subject: 'Mould in our bathroom', bodyPreview: '' }, 'a@gmail.com'), true);
});
