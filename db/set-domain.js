#!/usr/bin/env node
/**
 * Repoints the site at a different domain.
 *
 *   npm run set-domain -- --domain=example.co.uk
 *   npm run set-domain -- --check
 *
 * The site is static with no build step, so the canonical link, og tags, JSON-LD,
 * sitemap, robots.txt and the vercel.json www redirect all carry the domain
 * literally. A fork that skips this keeps telling search engines the real version
 * of the page lives on the original domain, which is the one mistake here that is
 * invisible in a browser and expensive in rankings.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from './prompt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every committed file that names the domain. Keep this list in step with the README. */
const FILES = [
  'public/index.html',
  'public/robots.txt',
  'public/sitemap.xml',
  'vercel.json',
  'db/create-user.js',
  '.env.example'
];

const DOMAIN_RE = /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)\b/i;

function validate(domain) {
  if (!domain) return 'Pass a domain, for example --domain=example.co.uk';
  if (/^https?:\/\//i.test(domain)) return 'Give the bare host, without https://';
  if (domain.includes('/')) return 'Give the bare host, with no path';
  if (domain.startsWith('www.')) return 'Give the apex domain, without www. The www redirect is derived from it.';
  if (!DOMAIN_RE.test(domain) || !DOMAIN_RE.exec(domain)[1] === domain) return `"${domain}" does not look like a domain`;
  return null;
}

/** Finds the domain the repo currently points at, by reading the canonical link. */
async function currentDomain() {
  const html = await readFile(join(ROOT, 'public/index.html'), 'utf8');
  const match = /<link rel="canonical" href="https:\/\/([^/"]+)\//.exec(html);
  if (!match) throw new Error('Could not find the canonical link in public/index.html');
  return match[1];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = await currentDomain();

  if (args.check) {
    console.log(`Current domain: ${from}`);
    for (const file of FILES) {
      const text = await readFile(join(ROOT, file), 'utf8');
      const hits = text.split('\n').filter((line) => line.includes(from)).length;
      console.log(`  ${String(hits).padStart(2, ' ')} line(s)  ${file}`);
    }
    return;
  }

  const to = String(args.domain || '').trim().toLowerCase();
  const problem = validate(to);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  if (to === from) {
    console.log(`Already pointing at ${to}. Nothing to do.`);
    return;
  }

  console.log(`Repointing ${from} to ${to}`);
  let total = 0;
  for (const file of FILES) {
    const path = join(ROOT, file);
    const before = await readFile(path, 'utf8');
    const after = before.replaceAll(from, to);
    if (before === after) {
      console.log(`  unchanged  ${file}`);
      continue;
    }
    const changed = before.split(from).length - 1;
    total += changed;
    await writeFile(path, after);
    console.log(`  ${String(changed).padStart(2, ' ')} change(s) ${file}`);
  }

  console.log(`\nDone, ${total} replacement(s).`);
  console.log('Still to do by hand:');
  console.log('  1. Add ' + to + ' and www.' + to + ' as domains in Vercel');
  console.log('  2. Replace public/assets/dampscan-logo.svg if the branding changes');
  console.log('  3. Commit the result');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
