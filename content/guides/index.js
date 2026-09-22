/**
 * Every guide.
 *
 * The directory is the list, as with the areas and services: adding a guide
 * means adding a file and nothing else, so one cannot be written and then
 * left unpublished.
 *
 * Files are named <site>-<slug>.js. A subject both sites cover is two
 * documents written from the two firms' positions, never one shared between
 * them: two domains publishing the same page compete for one query and Google
 * keeps one. scripts/guide-template.js says the same about the service pages.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(HERE))
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();

export const guides = await Promise.all(
  files.map((f) => import(`./${f}`).then((m) => m.default))
);
