/**
 * Connecting an AI assistant to the staff area.
 *
 * The whole sign-in, as ChatGPT does it: discover, register, sign in with a
 * staff code on our page, swap the code with PKCE, call tools, refresh. Then
 * the rules: only expected assistants may register, a code works once, the
 * assistant sees only the person's businesses, it can read but change only
 * the deposit, paid in full and report sent, and every change is audited.
 */
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://dampscan@127.0.0.1:55432/dampscan';
process.env.SESSION_SECRET = 'mcp-test-secret-long-enough-xxxxxxxx';
process.env.IP_SALT = 'mcp-test-salt-long-enough';
process.env.STAFF_ACCESS_CODE = '1290';

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used'); },
    query: async (t, p = []) => (await pool.query(t, p)).rows,
    queryOne: async (t, p = []) => { const { rows } = await pool.query(t, p); return rows[0] || null; },
    ping: async () => true
  }
});

const oauth = (await import('../lib/routes/admin/oauth.js')).default;
const mcp = (await import('../lib/routes/admin/mcp.js')).default;
const middleware = (await import('../middleware.js')).default;

const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
function makeReq({ method = 'POST', url, body, headers = {} }) {
  return { method, url, body, headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '198.51.100.77', ...headers }, socket: {} };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; }, end(p) { if (p) this.body += p; } };
  res.json = () => (res.body ? JSON.parse(res.body) : null);
  return res;
}
async function call(handler, init) { const res = makeRes(); await handler(makeReq(init), res); return res; }
const step = (s) => `/api/admin/oauth?step=${s}`;

async function person(code, grants) {
  const h = await hash(code, { algorithm: Algorithm.Argon2id });
  const { rows } = await pool.query('insert into people (name, passcode_hash) values ($1, $2) returning id', [code, h]);
  for (const g of grants) await pool.query("insert into grants (person_id, business_slug, level) values ($1, $2, 'manage')", [rows[0].id, g]);
  return Number(rows[0].id);
}

/** The whole sign-in, returning the tokens. */
async function connect(code) {
  const reg = (await call(oauth, { url: step('register'), body: { client_name: 'ChatGPT', redirect_uris: [REDIRECT] } })).json();
  const verifier = 'v'.repeat(64);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const params = { response_type: 'code', client_id: reg.client_id, redirect_uri: REDIRECT, state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256' };
  const pageRes = await call(oauth, { method: 'GET', url: step('authorize') + '&' + new URLSearchParams(params) });
  assert.equal(pageRes.statusCode, 200);
  assert.match(pageRes.body, /chatgpt\.com/);
  const signed = await call(oauth, { url: step('authorize'), body: { ...params, code } });
  if (signed.statusCode !== 302) return { status: signed.statusCode, body: signed.body };
  const back = new URL(signed.getHeader('location'));
  assert.equal(back.searchParams.get('state'), 'xyz');
  const tokens = (await call(oauth, { url: step('token'), body: `grant_type=authorization_code&code=${back.searchParams.get('code')}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_id=${reg.client_id}&code_verifier=${verifier}` })).json();
  return { ...tokens, clientId: reg.client_id, code: back.searchParams.get('code'), verifier };
}
let rpcId = 0;
const rpc = async (accessToken, method, params) => call(mcp, { url: '/api/admin/mcp', body: { jsonrpc: '2.0', id: ++rpcId, method, params }, headers: { authorization: `Bearer ${accessToken}` } });
const tool = async (accessToken, name, args = {}) => (await rpc(accessToken, 'tools/call', { name, arguments: args })).json().result;

before(async () => { await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await pool.query('truncate leads, events, rate_hits, jobs, people, audit, job_payments, payouts, mcp_clients, mcp_codes, mcp_tokens restart identity cascade'); });
after(async () => { await pool.end(); });

test('an assistant finds the sign-in from the 401 and the well-known addresses', async () => {
  const res = await call(mcp, { url: '/api/admin/mcp', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(res.statusCode, 401);
  assert.match(res.getHeader('www-authenticate'), /resource_metadata="https:\/\/dampscan\.co\.uk\/\.well-known\/oauth-protected-resource"/);
  const rewritten = await middleware(new Request('https://dampscan.co.uk/.well-known/oauth-authorization-server'));
  assert.match(rewritten.headers.get('x-middleware-rewrite'), /\/api\/admin\/oauth\?step=meta$/);
  const meta = (await call(oauth, { method: 'GET', url: step('meta') })).json();
  assert.equal(meta.token_endpoint, 'https://dampscan.co.uk/api/admin/oauth?step=token');
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
});

test('only the expected assistants may register, and a wrong code gets no token', async () => {
  const bad = await call(oauth, { url: step('register'), body: { redirect_uris: ['https://evil.example/cb'] } });
  assert.equal(bad.statusCode, 400);
  assert.equal((await call(oauth, { url: step('register'), body: { redirect_uris: ['http://chatgpt.com/cb'] } })).statusCode, 400, 'https only');
  await person('verge-code', ['roofing']);
  assert.equal((await connect('wrong-code')).status, 401);
});

test('a person connects, sees only their business, and a code and a refresh token each work once', async () => {
  await person('verge-code', ['roofing']);
  await pool.query(`insert into leads (site, stage, first_name, email, postcode, session_id) values ('roofing','complete','Ola','o@x.com','BR6 0AA',gen_random_uuid()), ('dampscan','complete','Dee','d@x.com','ME1 1AA',gen_random_uuid())`);
  const t = await connect('verge-code');
  assert.equal(t.token_type, 'Bearer');

  const init = (await rpc(t.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } })).json().result;
  assert.equal(init.serverInfo.name, 'staff-area');
  const tools = (await rpc(t.access_token, 'tools/list')).json().result.tools;
  const writes = tools.filter((x) => x.annotations.readOnlyHint === false).map((x) => x.name).sort();
  assert.deepEqual(writes, ['add_cost', 'add_note', 'add_person', 'add_quote_line', 'add_todo', 'attach_report', 'book_job', 'build_quote_from_words', 'close_enquiry', 'complete_todo', 'coolright_commissioning', 'coolright_service_plan', 'coolright_unit', 'create_client', 'create_invoice', 'create_job', 'create_quote_from_template', 'deactivate_person', 'delete_enquiry',
    'get_quote_link', 'handover_job', 'job_done', 'log_call', 'log_email', 'log_miles', 'log_time', 'mark_deposit_paid', 'mark_message_sent', 'mark_paid_in_full', 'mark_report_sent', 'match_payment', 'move_job', 'move_on_board', 'pencil_in', 'remove_playbook_note', 'remove_quote_line', 'reopen_enquiry', 'reopen_todo', 'reset_passcode',
    'save_playbook_note', 'save_report_draft', 'set_awaiting_agent', 'set_estate_agent', 'set_person_access', 'set_project_page', 'set_remedial_status', 'set_roofing_stage', 'update_client', 'update_job_status', 'update_roofing_plan', 'use_quote_lines_as_price']);
  assert.ok(tools.filter((x) => x.annotations.readOnlyHint === false).every((x) => /wait for the person to say yes/.test(x.description)), 'every change asks first');
  assert.ok(tools.every((x) => !('run' in x)));
  assert.ok(tools.some((x) => x.name === 'catch_up' && x.annotations.readOnlyHint), 'catch_up is listed as a read');
  assert.match(init.instructions, /catch_up/);

  const found = await tool(t.access_token, 'search', { text: 'BR6' });
  assert.deepEqual(found.structuredContent.enquiries.map((l) => l.first_name), ['Ola']);
  assert.deepEqual((await tool(t.access_token, 'search', { text: 'ME1' })).structuredContent.enquiries, [], 'not the damp lead');
  assert.deepEqual((await tool(t.access_token, 'whoami')).structuredContent.businesses.map((b) => b.slug), ['roofing']);

  const again = await call(oauth, { url: step('token'), body: `grant_type=authorization_code&code=${t.code}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_id=${t.clientId}&code_verifier=${t.verifier}` });
  assert.equal(again.statusCode, 400, 'the code was spent');
  const refreshed = (await call(oauth, { url: step('token'), body: { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.clientId } })).json();
  assert.ok(refreshed.access_token);
  assert.equal((await call(oauth, { url: step('token'), body: { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.clientId } })).statusCode, 400, 'rotated');
});

test('the three marks work on damp cards and quoted jobs, each audited, and nothing else can be changed', async () => {
  const pid = await person('both-code', ['dampscan', 'roofing']);
  const damp = (await pool.query(`insert into jobs (site, status, survey_price_pence, surveyor, tax_bp, lead_bp, lead_earner, partner_a, partner_b) values ('dampscan','booked',45000,'tom',2000,1000,'scott','scott','tom') returning id`)).rows[0].id;
  const roof = (await pool.query(`insert into jobs (site, status, invoice_net_pence, surveyor, survey_price_pence, tax_bp, lead_bp, lead_earner, partner_a, partner_b, reserve_bp, fee_bp, fee_floor_pence, split_bp) values ('roofing','booked',800000,null,0,0,0,'','','',1900,1000,0,5000) returning id`)).rows[0].id;
  const t = await connect('both-code');

  assert.equal((await tool(t.access_token, 'mark_deposit_paid', { id: Number(damp) })).isError, false);
  assert.equal((await tool(t.access_token, 'mark_report_sent', { id: Number(damp) })).isError, false);
  assert.equal((await tool(t.access_token, 'mark_paid_in_full', { id: Number(damp) })).isError, false);
  const row = (await pool.query('select deposit_paid_at, paid_at, survey_sent_at from jobs where id = $1', [damp])).rows[0];
  assert.ok(row.deposit_paid_at && row.paid_at && row.survey_sent_at);

  assert.equal((await tool(t.access_token, 'mark_deposit_paid', { id: Number(roof) })).isError, true, 'a roofing deposit needs an amount');
  assert.equal((await tool(t.access_token, 'mark_deposit_paid', { id: Number(roof), amount_pounds: 2000 })).isError, false);
  assert.equal((await tool(t.access_token, 'mark_paid_in_full', { id: Number(roof) })).isError, false);
  const paid = (await pool.query('select label, amount_pence from job_payments where job_id = $1 order by id', [roof])).rows;
  assert.deepEqual(paid.map((p) => [p.label, Number(p.amount_pence)]), [['deposit', 200000], ['balance', 600000]]);
  assert.equal((await tool(t.access_token, 'mark_paid_in_full', { id: Number(roof) })).isError, true, 'nothing left to pay');
  assert.equal((await tool(t.access_token, 'mark_report_sent', { id: Number(roof) })).isError, true);

  /* Awaiting estate agent confirmation: set, read back, and cleared by a time. */
  assert.equal((await tool(t.access_token, 'set_awaiting_agent', { id: Number(damp), awaiting: true })).isError, false);
  const got = await tool(t.access_token, 'get_job', { id: Number(damp) });
  assert.equal(got.structuredContent.job.awaitingAgent, true);
  assert.equal(got.structuredContent.job.card.awaitingAgent, true);
  assert.equal((await tool(t.access_token, 'move_job', { id: Number(damp), time: '10:30' })).isError, false);
  assert.equal((await pool.query('select awaiting_agent from jobs where id = $1', [damp])).rows[0].awaiting_agent, false, 'a time clears it');
  assert.equal((await tool(t.access_token, 'set_awaiting_agent', { id: Number(roof) })).isError, true, 'damp only');

  const audited = (await pool.query('select person_id from audit where entity_id in ($1, $2)', [damp, roof])).rows;
  assert.ok(audited.length >= 4 && audited.every((a) => Number(a.person_id) === pid), 'under the person\'s name');
  assert.equal((await tool(t.access_token, 'delete_job', { id: Number(roof) })).isError, true, 'no such tool');
  assert.equal((await tool(t.access_token, 'get_job', { id: 999 })).isError, true);
});

test('a deactivated person\'s assistant stops working at once', async () => {
  const pid = await person('gone-code', ['roofing']);
  const t = await connect('gone-code');
  assert.equal((await rpc(t.access_token, 'tools/list')).statusCode, 200);
  await pool.query('update people set active = false where id = $1', [pid]);
  assert.equal((await rpc(t.access_token, 'tools/list')).statusCode, 401);
});

test('every read works for the owners\' code, which sees all four businesses', async () => {
  const t = await connect('1290');
  const today = new Date().toISOString().slice(0, 10);
  const args = { search: { text: 'a' + 'b' }, get_job: { id: 1 }, calendar: { from: today, to: today }, job_photos: { job: 1 }, price_book: { site: 'roofing' }, list_price_book: { site: 'roofing' },
    get_message: { id: 1, kind: 'rating' }, get_google_post: { id: 1 }, get_invoice_link: { id: 1 }, find_client: { text: 'ab' }, find_enquiry: { text: 'ab' }, customer_history: { words: 'ab' }, get_report_draft: { id: 1 }, draft_message: { id: 1 }, links_for: { id: 1, text: 'hi' }, get_report_file: { id: 1 }, match_email: { from_email: 'a@example.com' }, ads_conversion_setup: { site: 'roofing' } };
  const tools = (await rpc(t.access_token, 'tools/list')).json().result.tools.filter((x) => x.annotations.readOnlyHint);
  for (const x of tools) {
    const r = await tool(t.access_token, x.name, args[x.name] || {});
    const expectedMissing = ['get_job', 'job_photos', 'get_message', 'get_google_post', 'get_invoice_link', 'get_report_draft', 'draft_message', 'links_for', 'get_report_file'].includes(x.name);
    assert.equal(r.isError, expectedMissing, `${x.name}: ${r.content[0].text.slice(0, 160)}`);
  }
  assert.deepEqual((await tool(t.access_token, 'whoami')).structuredContent.businesses.map((b) => b.slug).sort(), ['ac', 'ati-london', 'dampscan', 'roofing']);
});

test('the well-known addresses answer through the admin function, as Vercel delivers them', async () => {
  const admin = (await import('../api/admin/[action].js')).default;
  for (const [path, key] of [['/.well-known/oauth-protected-resource', 'authorization_servers'], ['/.well-known/oauth-protected-resource/api/admin/mcp', 'authorization_servers'],
    ['/.well-known/oauth-authorization-server', 'token_endpoint'], ['/.well-known/openid-configuration', 'token_endpoint']]) {
    const res = await call(admin, { method: 'GET', url: path });
    assert.equal(res.statusCode, 200, path);
    assert.ok(key in res.json(), path);
  }
});
