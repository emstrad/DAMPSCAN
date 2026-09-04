/**
 * The upload route and the staff route that reads back what it stored.
 *
 * Both ends of lib/blob.js are mocked, so these tests are about the rules
 * around the store rather than the store itself: what a visitor is allowed to
 * upload, what happens when there is no store configured, and whether a
 * signed-in staff member can reach a blob that no lead points at.
 *
 * That last one is the reason this file exists. The blobs are private, which
 * means the only route to them is /api/admin/attachment, which means a missing
 * ownership check there would turn one staff login into the whole store.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';

process.env.SESSION_SECRET = 'attachment-test-secret-long-enough-x';
process.env.IP_SALT = 'attachment-test-salt';

/* Rows the fake database will answer with, reset per test. */
let ownedPaths = [];
let stored = [];
let storeFails = false;
let presignFails = false;
/* Bucket name to hit count, so one test can push the global ceiling over. */
let hits = {};

mock.module('../lib/db.js', {
  namedExports: {
    sql: () => { throw new Error('not used in tests'); },
    // Per-IP throttling has its own tests; here only the global ceiling is exercised.
    query: async (text, params = []) => [{ hits: hits[params[0]] ?? 1 }],
    queryOne: async (text, params = []) => {
      if (text.includes('any(files)')) return ownedPaths.includes(params[0]) ? { '?column?': 1 } : null;
      return { hits: 1 };
    },
    ping: async () => true
  }
});

mock.module('../lib/blob.js', {
  namedExports: {
    ATTACHMENT_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'],
    MAX_ATTACHMENT_BYTES: 25 * 1024 * 1024,
    MAX_PROXY_BYTES: 4 * 1024 * 1024,
    blobConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    presignAttachment: async (name) => (presignFails
      ? { ok: false, reason: 'presign_failed' }
      : { ok: true, url: 'https://blob.example/put?sig=abc', path: `leads/2026-09-04/uuid-${name}` }),
    storeAttachment: async (name, contentType, body) => {
      if (storeFails) return { ok: false, reason: 'store_failed' };
      const path = `leads/2026-09-04/${name}`;
      stored.push({ path, contentType, bytes: body.length });
      return { ok: true, path };
    },
    readAttachment: async (path) => ({
      ok: true,
      stream: Readable.toWeb(Readable.from([Buffer.from('PDF-' + path)])),
      contentType: 'application/pdf',
      size: 4 + path.length
    })
  }
});

const upload = (await import('../api/upload.js')).default;
const uploadUrl = (await import('../api/upload-url.js')).default;
const { downloadName } = await import('../api/admin/attachment.js');
const attachment = (await import('../api/admin/attachment.js')).default;
const { signSession, COOKIE_NAME } = await import('../lib/session.js');

function makeRes() {
  const res = new PassThrough();
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = function (k, v) { this.headers[k.toLowerCase()] = v; };
  res.getHeader = function (k) { return this.headers[k.toLowerCase()]; };
  res.text = () => Buffer.concat(chunks).toString('utf8');
  res.json = () => JSON.parse(res.text());
  return res;
}

/** A request whose body is the file itself, the way the browser sends it. */
function uploadReq(url, contentType, chunks) {
  const req = Readable.from(chunks);
  req.method = 'POST';
  req.url = url;
  req.headers = { host: 'dampscan.co.uk', 'content-type': contentType, 'x-forwarded-for': '203.0.113.9' };
  req.socket = { remoteAddress: '203.0.113.9' };
  return req;
}

async function post(url, contentType, chunks) {
  const res = makeRes();
  await upload(uploadReq(url, contentType, chunks), res);
  return res;
}

async function get(path, cookie, accept) {
  const res = makeRes();
  const req = {
    method: 'GET',
    url: '/api/admin/attachment?path=' + encodeURIComponent(path),
    headers: { host: 'dampscan.co.uk', ...(cookie ? { cookie } : {}), ...(accept ? { accept } : {}) },
    socket: { remoteAddress: '203.0.113.9' }
  };
  await attachment(req, res);
  // The success path pipes, so wait for the stream rather than for the handler.
  if (!res.writableEnded) await new Promise((r) => res.on('finish', r));
  return res;
}

const staffCookie = () => COOKIE_NAME + '=' + encodeURIComponent(signSession({
  sub: 1, email: 'staff@example.com', role: 'staff', exp: Math.floor(Date.now() / 1000) + 600
}));

beforeEach(() => {
  ownedPaths = [];
  stored = [];
  storeFails = false;
  presignFails = false;
  hits = {};
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
});

/** POST /api/upload-url with a JSON body. */
async function ticket(body, headers){
  const res = makeRes();
  await uploadUrl({
    method: 'POST',
    url: '/api/upload-url',
    headers: { host: 'dampscan.co.uk', 'x-forwarded-for': '203.0.113.9', ...headers },
    body,
    socket: { remoteAddress: '203.0.113.9' }
  }, res);
  return res;
}

/* ------------------------------------------------------- presigned upload ---- */
test('a presigned PUT is handed back, with the path it will land at', async () => {
  const res = await ticket({ name: 'survey.pdf', type: 'application/pdf' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.match(body.url, /^https:\/\//);
  assert.equal(body.path, 'leads/2026-09-04/uuid-survey.pdf');
  // This is the whole point of the route: past what a function will carry.
  assert.ok(body.maxBytes > 4.5 * 1024 * 1024);
});

test('the presign route refuses a type we do not take', async () => {
  const res = await ticket({ name: 'payload.exe', type: 'application/x-msdownload' });
  assert.equal(res.statusCode, 415);
});

test('presigning that fails answers 200, so the browser can fall back', async () => {
  presignFails = true;
  const res = await ticket({ name: 'survey.pdf', type: 'application/pdf' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, false);
  assert.equal(res.json().error, 'presign_failed');
});

test('no store configured is reported the same way on the presign route', async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const res = await ticket({ name: 'survey.pdf', type: 'application/pdf' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().error, 'not_configured');
});

test('the presign route is same-origin only', async () => {
  const res = await ticket({ name: 'survey.pdf', type: 'application/pdf' },
    { origin: 'https://evil.example' });
  assert.equal(res.statusCode, 403);
});

/* ---------------------------------------------------------------- upload ---- */
test('a photo is stored and its path handed back', async () => {
  const res = await post('/api/upload?name=wall.jpg', 'image/jpeg', [Buffer.alloc(2048, 1)]);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.path, 'leads/2026-09-04/wall.jpg');
  assert.equal(stored[0].bytes, 2048);
});

test('a file type we do not want is refused before anything is read', async () => {
  const res = await post('/api/upload?name=payload.exe', 'application/x-msdownload', [Buffer.alloc(16)]);
  assert.equal(res.statusCode, 415);
  assert.equal(stored.length, 0);
});

test('HEIC with no content type is accepted on its extension', async () => {
  // What an iPhone actually sends. Refusing it would reject the most common
  // photo on the most common device.
  const res = await post('/api/upload?name=IMG_4021.HEIC', '', [Buffer.alloc(64)]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test('the size cap is enforced on the stream, not on a header', async () => {
  // Six megabytes, which Vercel would refuse before us in production anyway.
  // The cap has to trip on what actually arrives, not on Content-Length.
  const six = Array.from({ length: 6 }, () => Buffer.alloc(1024 * 1024));
  const res = await post('/api/upload?name=huge.jpg', 'image/jpeg', six);
  assert.equal(res.statusCode, 413);
  assert.equal(stored.length, 0, 'nothing reaches the store once the cap is passed');
});

test('a file just under the cap is accepted', async () => {
  const res = await post('/api/upload?name=report.pdf', 'application/pdf',
    [Buffer.alloc(4 * 1024 * 1024 - 1)]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test('an empty body is a 400 rather than an empty blob', async () => {
  const res = await post('/api/upload?name=nothing.pdf', 'application/pdf', []);
  assert.equal(res.statusCode, 400);
});

test('no blob store configured is a plain answer, not an error', async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const res = await post('/api/upload?name=wall.jpg', 'image/jpeg', [Buffer.alloc(16)]);
  assert.equal(res.statusCode, 200, 'the booking must not see a failure it cannot act on');
  assert.deepEqual(res.json(), { ok: false, stored: false, error: 'not_configured' });
});

test('a store that fails still answers 200, so the booking carries on', async () => {
  storeFails = true;
  const res = await post('/api/upload?name=wall.jpg', 'image/jpeg', [Buffer.alloc(16)]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, false);
});

test('a cross-origin post is refused outright', async () => {
  const res = makeRes();
  const req = uploadReq('/api/upload?name=wall.jpg', 'image/jpeg', [Buffer.alloc(16)]);
  req.headers.origin = 'https://evil.example';
  await upload(req, res);
  assert.equal(res.statusCode, 403);
});

test('only POST is allowed', async () => {
  const res = makeRes();
  const req = uploadReq('/api/upload', 'image/jpeg', []);
  req.method = 'GET';
  await upload(req, res);
  assert.equal(res.statusCode, 405);
});

/* ------------------------------------------------------------ read back ---- */
test('reading an attachment needs a staff session', async () => {
  ownedPaths = ['leads/2026-09-04/report.pdf'];
  const res = await get('leads/2026-09-04/report.pdf');
  assert.equal(res.statusCode, 401);
});

test('a signed-in staff member gets the file', async () => {
  ownedPaths = ['leads/2026-09-04/report.pdf'];
  const res = await get('leads/2026-09-04/report.pdf', staffCookie());
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader('content-type'), 'application/pdf');
  assert.match(res.getHeader('content-disposition'), /^attachment;/);
  assert.equal(res.text(), 'PDF-leads/2026-09-04/report.pdf');
});

test('a blob no lead points at is a 404 even for staff', async () => {
  // The check that stops one login walking the whole store by guessing paths.
  ownedPaths = ['leads/2026-09-04/report.pdf'];
  const res = await get('leads/2026-09-04/somebody-elses.pdf', staffCookie());
  assert.equal(res.statusCode, 404);
});

test('a missing path is a 400', async () => {
  const res = await get('', staffCookie());
  assert.equal(res.statusCode, 400);
});

/* ------------------------------------------------------ global ceiling ---- */
test('the global upload ceiling refuses even a quiet address once it is reached', async () => {
  // A pool of addresses each under its own limit is how a per-IP throttle is
  // walked past, and this route writes 25MB a time into a store billed by the
  // gigabyte. The ceiling is what turns that from a bill into a 429.
  hits = { upload_global: 201 };
  const res = await ticket({ name: 'survey.pdf', type: 'application/pdf' });
  assert.equal(res.statusCode, 429);
  assert.equal(stored.length, 0);
});

test('under the ceiling, the per-IP limit still applies on its own', async () => {
  hits = { upload: 21 };
  const res = await post('/api/upload?name=wall.jpg', 'image/jpeg', [Buffer.alloc(16)]);
  assert.equal(res.statusCode, 429);
});

/* ------------------------------------------------ email link on a phone ---- */
test('a signed-out browser navigation is sent to sign in, and told where to come back to', async () => {
  // The link arrives by email and is opened on a phone that has never seen
  // the staff area. A JSON 401 there is a dead end.
  const res = await get('leads/2026-09-04/report.pdf', null, 'text/html,application/xhtml+xml');
  assert.equal(res.statusCode, 302);
  assert.equal(res.getHeader('location'),
    '/staff?next=' + encodeURIComponent('/api/admin/attachment?path=leads%2F2026-09-04%2Freport.pdf'));
  assert.equal(res.getHeader('cache-control'), 'no-store');
});

test('a signed-out non-browser request still gets the 401, never a redirect', async () => {
  const res = await get('leads/2026-09-04/report.pdf', null, 'application/json');
  assert.equal(res.statusCode, 401);
});

test('the download filename drops the uuid the presign put on the front', () => {
  assert.equal(downloadName('leads/2026-09-04/0b21f0d4-5c9e-4a1b-9f77-2b3c4d5e6f70-survey.pdf'), 'survey.pdf');
  // The proxy route names files differently, and those are left alone.
  assert.equal(downloadName('leads/2026-09-04/survey-Ab3x9.pdf'), 'survey-Ab3x9.pdf');
});

test('the streamed file is named for a person, not for the store', async () => {
  const path = 'leads/2026-09-04/0b21f0d4-5c9e-4a1b-9f77-2b3c4d5e6f70-report.pdf';
  ownedPaths = [path];
  const res = await get(path, staffCookie());
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader('content-disposition'), 'attachment; filename="report.pdf"');
});
