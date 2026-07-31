/**
 * Every service page.
 *
 * The directory is the list, as with the areas: adding a page means adding a
 * file and nothing else, so a page cannot be written and then left unpublished.
 *
 * Files are named <site>-<slug>.js because the two sites cover the same eight
 * subjects from genuinely different positions, so each pair is two documents
 * rather than one shared between them.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(HERE))
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();

export const services = await Promise.all(
  files.map((f) => import(`./${f}`).then((m) => m.default))
);
