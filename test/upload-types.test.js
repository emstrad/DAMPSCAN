/**
 * A file is only ever stored and sent back as one of our own types: a caller
 * naming a page "photo.png" with Content-Type text/html must not get a page
 * that runs on our domain (the security review, 14 Nov 2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { storedType } = await import('../api/upload.js');

test('the stored type comes from our list or the extension, never the caller', () => {
  assert.equal(storedType('damp.png', 'text/html'), 'image/png');
  assert.equal(storedType('damp.PNG', 'image/svg+xml'), 'image/png');
  assert.equal(storedType('IMG_1.HEIC', ''), 'image/heic');
  assert.equal(storedType('report.pdf', 'application/pdf'), 'application/pdf');
  assert.equal(storedType('photo.jpg', 'image/jpeg'), 'image/jpeg');
});

test('files from a customer page are never served as a page', async () => {
  const src = await readFile(new URL('../lib/portal.js', import.meta.url), 'utf8');
  assert.match(src, /Content-Security-Policy', "sandbox/);
  assert.match(src, /X-Content-Type-Options', 'nosniff'/);
  assert.match(src, /SERVE\.has\(/);
});
