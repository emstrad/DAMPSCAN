/**
 * The home page booking trial (the owner's brief, 15 Nov 2026): an exact copy of
 * each site's real home page, written into the staff area, with only the booking
 * form swapped for the new four-step one to try before it goes live. Built from
 * the home page itself on every build, so it never drifts from what customers see.
 *
 * Nothing on it reaches anyone: the scripts that record visits, save
 * half-finished forms, send enquiries, look up addresses and upload files are
 * left out, the ads tag is emptied, it is never indexed, and its free times come
 * from the Lab's managers-only route (public/assets/bf.js in trial mode).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dampForm } from './book-form.js';
import { withTour } from './home-tour.js';
import { renderAgents } from './agents-page.js';

const BF_START = '<!-- book-form:start, filled by scripts/build-pages.js -->';
const BF_END = '<!-- book-form:end -->';
const AD_START = '<!-- ads-tag:start, filled by scripts/build-pages.js -->';
const AD_END = '<!-- ads-tag:end -->';
/* The scripts that send something real: none comes across, and the form runs in trial mode. */
const LIVE_SCRIPTS = /\s*<script src="\/assets\/(visit|partial|book|address|upload)\.js[^"]*"( defer)?><\/script>/g;

/* The real home page, its form swapped, its live scripts and ads tag out, never indexed. */
export function trialPage(html, site) {
  const from = html.indexOf(BF_START), to = html.indexOf(BF_END);
  const a = html.indexOf(AD_START), b = html.indexOf(AD_END);
  if (from === -1 || to === -1 || a === -1 || b === -1) throw new Error(`${site} home page: markers missing for the trial`);
  let out = html.slice(0, a) + `${AD_START}\n${AD_END}` + html.slice(b + AD_END.length);
  const f2 = out.indexOf(BF_START), t2 = out.indexOf(BF_END);
  out = out.slice(0, f2) + `${BF_START}\n${dampForm(site)}\n    ${BF_END}` + out.slice(t2 + BF_END.length);
  out = out.replace(LIVE_SCRIPTS, '')
    .replace(/<link rel="canonical"[^>]*>\s*/, '')
    /* It lives under /staff/, so a path written relative to the site root is made absolute. */
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow" />')
    .replace(/<script src="\/assets\/bf\.js([^"]*)"><\/script>/, '<script src="/assets/bf.js$1" data-mode="trial"></script>');
  return out;
}

/** Written beside the Lab: /staff/home-trial-dampscan.html and /staff/home-trial-ati.html. */
export async function writeTrialHomes(root, home) {
  for (const [site, file] of Object.entries(home)) {
    const html = await readFile(join(root, file), 'utf8');
    await writeFile(join(root, 'public', 'staff', `home-trial-${site}.html`), trialPage(html, site), 'utf8');
  }
}

/* The new home page to look at before it goes live (the owner, 22 Nov 2026: "an
   exact one-to-one ... I can share with Tom"): the same staff copy, with the
   survey page tour and, for ATi, the estate agents line and its page. */
const noIndex = (html) => html.replace(/<!-- Google tag \(gtag\.js\) -->[\s\S]*?window\.DS_ADS_CONVERSION[^<]*<\/script>/, '').replace(/<link rel="canonical"[^>]*>\s*/, '')
  .replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow" />');
export async function writePreviewHomes(root, home) {
  for (const [site, file] of Object.entries(home)) {
    const html = await readFile(join(root, file), 'utf8');
    await writeFile(join(root, 'public', 'staff', `home-trial-new-${site}.html`), withTour(trialPage(html, site), site, { agentHref: '/staff/home-trial-agents-ati.html' }), 'utf8');
  }
  await writeFile(join(root, 'public', 'staff', 'home-trial-agents-ati.html'), noIndex(renderAgents()), 'utf8');
}
