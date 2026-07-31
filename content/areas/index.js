/**
 * Every area page.
 *
 * The directory is the list. Adding a town means adding a file and nothing
 * else: there is no register to update and therefore no way to write a page and
 * forget to publish it, which is exactly what happened when this was a hand
 * maintained set of imports.
 *
 * `npm run build:areas` turns these into public/areas/<site>/<slug>.html, which
 * middleware.js serves at /damp-survey/<slug> on the matching host.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(HERE))
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();

/** Sorted by file name, so the build output is stable between runs. */
export const areas = await Promise.all(
  files.map((f) => import(`./${f}`).then((m) => m.default))
);
