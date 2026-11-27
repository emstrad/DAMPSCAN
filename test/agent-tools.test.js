/**
 * The estate agent's page for the assistant (the owner, 27 Nov 2026): a link
 * for the agent on the card, opening on that survey, showing all of theirs and
 * nobody else's; a quick book link; the buyer's page (payment details) off on
 * the agent's page unless chosen; a new link stops the old one. Nothing sent.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'agent-tools-secret-long-enough-xxxxxxxxx';
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', { namedExports: { sql: () => { throw new Error('not used'); }, query: async (t, p = []) => (await pool.query(t, p)).rows, queryOne: async (t, p = []) => (await pool.query(t, p)).rows[0] || null, ping: async () => true } });

const { TOOLS } = await import('../lib/mcp/tools.js');
const { agentByToken, agentView } = await import('../lib/agent-portal.js');
const run = (name, scope, args) => TOOLS.find((t) => t.name === name).run(scope, args);
const BOSS = { isAdmin: true, name: 'Owners', businesses: ['dampscan', 'ati-london'], levels: { dampscan: 'manage', 'ati-london': 'manage' } };
const BEN = { isAdmin: false, personId: 9, name: 'Ben', businesses: ['ati-london'], levels: { 'ati-london': 'work' } };

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate jobs, leads, estate_agents, portal_events restart identity cascade'); });
after(async () => { await pool.end(); });

async function agent(name, site = null) { return Number((await pool.query('insert into estate_agents (name, site) values ($1, $2) returning id', [name, site])).rows[0].id); }
async function job(name, postcode, agentId) {
  return Number((await pool.query(`insert into jobs (site, status, customer_name, customer_postcode, survey_type, survey_price_pence, date_set, job_date, job_time, surveyor, estate_agent_id,
      tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp)
    values ('ati-london', 'booked', $1, $2, 'localised', 21500, true, current_date + 6, '12:00', 'tom', $3, 2000, 0, 'scott', 'tom', 'ben', 0, 0, 0, 5000) returning id`, [name, postcode, agentId])).rows[0].id);
}
const token = (url) => /\/a\/([A-Za-z0-9_-]+)/.exec(url)[1];

test('the agent on the card gets one page, opening on the survey asked for, with all theirs and no one else\'s', async () => {
  const ca = await agent('CA Services'), other = await agent('Harbour Homes', 'ati-london');
  const id = await job('Ms D. Mcniven', 'W12 9NE', ca);
  await job('Mr P. Lane', 'W12 8QT', ca);
  await job('Kim Lee', 'SE18 3QJ', other);
  const r = (await run('agent_portal_link', BOSS, { id })).data;
  console.log('agent link for the dummy job:', r.url);
  assert.equal(r.ok, true);
  assert.match(r.url, new RegExp(`^https://atidampsurvey\\.co\\.uk/a/[A-Za-z0-9_-]{30,}#job-${id}$`));
  assert.equal(r.agent.name, 'CA Services');
  assert.deepEqual(r.covers.map((c) => c.postcode).sort(), ['W12 8QT', 'W12 9NE']);
  assert.equal(r.covers.find((c) => c.thisOne).postcode, 'W12 9NE');
  assert.match(r.said, /Nothing was sent/);
  /* The same link next time; the page itself shows only theirs. */
  assert.equal((await run('agent_portal_link', BOSS, { id })).data.url, r.url);
  const page = await agentView(await agentByToken(token(r.url)));
  assert.deepEqual(page.current.map((s) => s.postcode).sort(), ['W12 8QT', 'W12 9NE']);
  assert.equal((await pool.query('select portal_opens from estate_agents where id = $1', [ca])).rows[0].portal_opens, 1);
  assert.equal((await run('agent_portal_link', BEN, { id })).status, 400, 'managers only');
});

test('no agent on the card, or the buyer\'s page and its payment details, are said plainly', async () => {
  const bare = await job('Sam Taylor', 'N1 3GZ', null);
  assert.match((await run('agent_portal_link', BOSS, { id: bare })).data.error, /no estate agent on the card/);
  const ca = await agent('CA Services', 'ati-london'); await job('Ms D. Mcniven', 'W12 9NE', ca);
  const { url } = (await run('agent_quick_book_link', BOSS, { agent: 'CA Services' })).data;
  assert.match(url, /#book$/);
  const a = await agentByToken(token(url));
  assert.equal((await agentView(a)).current[0].page, null, 'no buyer page (payments) unless chosen');
  await run('agent_portal_settings', BOSS, { agent: 'CA', share_buyer_page: true });
  assert.ok((await agentView(await agentByToken(token(url)))).current[0].page, 'shown once chosen');
  const fresh = (await run('agent_portal_settings', BOSS, { agent: 'CA Services', new_link: true })).data.url;
  assert.notEqual(token(fresh), token(url));
  assert.equal(await agentByToken(token(url)), null, 'the old link stops working');
});

test('several agents matching is a question, not a guess', async () => {
  await agent('Harbour Homes', 'ati-london'); await pool.query(`insert into estate_agents (name, branch, site) values ('Harbour Homes', 'Woolwich', 'ati-london')`);
  const r = await run('agent_quick_book_link', BOSS, { agent: 'Harbour' });
  assert.equal(r.status, 409);
  assert.equal(r.data.agents.length, 2);
});
