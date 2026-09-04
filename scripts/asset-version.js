/**
 * Cache busting for the scripts and stylesheets under public/assets.
 *
 * vercel.json serves everything under /assets as immutable for a year, which
 * is the right policy for a URL that never changes its content and the wrong
 * one for a URL that does. A browser holding an immutable copy will not even
 * ask whether it is stale, so a returning visitor keeps the book.js they had
 * last month and runs it against this month's markup. The day the owner or
 * landlord question came out of the form, that combination threw on submit
 * for every one of them.
 *
 * So a reference to a file under assets carries a short hash of the file's
 * content: /assets/book.js?v=3fa9c1d2. Change the file and the URL changes
 * with it, the old cached copy is never asked for again, and the immutable
 * header stays honest. Vercel ignores the query string when serving a static
 * file, so nothing on the server side needs to know.
 *
 * The build applies this to every page it writes and to the two hand written
 * home pages. A test in test/assets.test.js checks every stamp in shipped HTML
 * against the file it names, so an edit to an asset without a rebuild fails CI
 * rather than shipping a stale stamp.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ASSET_RE = /(["'(])(\/assets\/[A-Za-z0-9_./-]+\.(?:js|css))(\?v=[0-9a-f]+)?(["')])/g;

/** Eight hex characters of sha256: enough to never collide, short enough to read. */
export function hashOf(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

/**
 * Content hash for every .js and .css directly under public/assets, keyed by
 * the path a page would reference it with.
 * @returns {Promise<Map<string, string>>}  e.g. '/assets/book.js' -> '3fa9c1d2'
 */
export async function assetHashes(root) {
  const dir = join(root, 'public', 'assets');
  const hashes = new Map();
  for (const name of await readdir(dir)) {
    if (!/\.(js|css)$/.test(name)) continue;
    hashes.set(`/assets/${name}`, hashOf(await readFile(join(dir, name))));
  }
  return hashes;
}

/**
 * Rewrites every asset reference in a page to carry its current hash. A path
 * with no entry in `hashes` is left as it was, so a reference to something
 * that does not exist is not silently made to look versioned.
 */
export function stampAssets(html, hashes) {
  return html.replace(ASSET_RE, (whole, open, path, _old, close) => {
    const hash = hashes.get(path);
    return hash ? `${open}${path}?v=${hash}${close}` : whole;
  });
}

/** Every stamped reference in a page, for the test that checks them. */
export function stampedReferences(html) {
  const out = [];
  for (const match of html.matchAll(ASSET_RE)) {
    out.push({ path: match[2], version: match[3] ? match[3].slice(3) : null });
  }
  return out;
}
