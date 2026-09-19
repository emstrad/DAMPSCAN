/**
 * npm run build:check
 *
 * Fails if the committed pages are not what the generators produce from the
 * committed content. Nothing here generates anything of its own: it runs the
 * real build and then asks git what moved.
 *
 * Why this exists. The generated HTML is committed and Vercel serves public/
 * exactly as it sits, with no build step at deploy. That is a deliberate and
 * good decision, and its one weakness is that editing content/ without running
 * the build ships nothing, silently, and editing a generated page by hand is
 * undone the next time somebody does run it. Neither leaves a trace. This turns
 * both into a failed check.
 *
 * It matters more than usual right now. Bringing two more brands into SITES
 * means proving that every DampScan and ATi page comes out byte for byte as it
 * went in, and a promise to diff carefully by hand is not the same thing as a
 * test that refuses to pass.
 *
 * Rather than a --check flag threaded through build-pages.js: that build writes
 * in place across several passes, including the marker rewrites and the asset
 * stamping, and every one of them would need to learn to pretend. Running the
 * real thing and reading the diff checks all of those at once and cannot drift
 * away from what the build actually does, because it is what the build actually
 * does.
 *
 * The two sitemaps are compared ignoring <lastmod>. They stamp the day the
 * build ran, so they differ every day whatever the content says. Every other
 * line of them is still compared, so adding a page and forgetting to list it
 * still fails.
 */
import { execFileSync } from 'node:child_process';

const SITEMAPS = ['public/sitemap.xml', 'public/sitemap-london.xml'];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/* Porcelain is the stable, script-readable form. Each line is two status
   characters, a space, then the path; a rename carries an arrow. */
function changedPaths() {
  return git('status', '--porcelain')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim().split(' -> ').pop());
}

/* True when every line the diff moved was a lastmod. -U0 asks for no context,
   so the only +/- lines are real changes, and the +++/--- file headers are
   dropped by the length check. */
function onlyTheDateMoved(path) {
  const diff = git('diff', '-U0', '--', path);
  return diff
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .every((line) => line.includes('<lastmod>'));
}

function main() {
  const dirty = changedPaths();
  if (dirty.length) {
    console.error('build:check needs a clean tree, because it restores one afterwards.');
    console.error('Uncommitted changes in:');
    for (const path of dirty) console.error('  ' + path);
    console.error('\nCommit or stash them, then run it again.');
    process.exit(1);
  }

  try {
    execFileSync('node', ['scripts/build-pages.js'], { encoding: 'utf8' });
  } catch (error) {
    console.error('the build itself failed, so there is nothing to compare:\n');
    console.error(error.stdout || '');
    console.error(error.stderr || '');
    process.exit(1);
  }

  const moved = changedPaths();
  const stale = moved.filter((path) => !(SITEMAPS.includes(path) && onlyTheDateMoved(path)));

  /* Safe because the tree was verified clean above, so everything being undone
     here was written by the build a moment ago. clean is limited to public/,
     which is the only place the build creates files, and without -x so nothing
     ignored is touched. */
  git('checkout', '--', '.');
  git('clean', '-fdq', '--', 'public');

  if (stale.length) {
    console.error('these committed files are not what the build produces:\n');
    for (const path of stale) console.error('  ' + path);
    console.error('\nRun `npm run build:pages` and commit the result.');
    console.error('If you did not expect this, something was edited by hand that the');
    console.error('build owns, and the build is about to overwrite it.');
    process.exit(1);
  }

  console.log(`pages are current (${moved.length ? SITEMAPS.length + ' sitemaps differ only by their date' : 'nothing moved at all'})`);
}

main();
