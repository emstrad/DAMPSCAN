/**
 * Every generated home page.
 *
 * The directory is the list, as with the areas, services and guides: a brand
 * gets a home page by writing its file here. The two damp brands are absent on
 * purpose, because index.html and london.html are hand written and stay that
 * way.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(HERE))
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();

export const homes = await Promise.all(
  files.map(async (f) => (await import(`./${f}`)).default)
);
