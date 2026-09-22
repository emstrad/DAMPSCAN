/**
 * Real reviews, per brand.
 *
 * The directory is the list, as with the areas, services, guides and home
 * pages. This used to import two files by name and say there would only ever be
 * two sites, which stopped being true the moment a third brand arrived: a new
 * brand could not have reviews at all without editing this file, and nothing
 * would have said so.
 *
 * A brand with no file here has no reviews, which is the correct state for one
 * that has not collected five yet. The section ships hidden rather than empty.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const files = (await readdir(HERE))
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .sort();

export const reviews = Object.fromEntries(
  await Promise.all(
    files.map(async (f) => [basename(f, '.js'), (await import(`./${f}`)).default])
  )
);
