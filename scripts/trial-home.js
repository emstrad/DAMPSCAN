/**
 * The home page booking trial (the owner's brief, 15 Nov 2026): an exact copy of
 * each site's real home page, written into the staff area, with only the booking
 * form swapped for the new four-step one to try before it goes live. Built from
 * the home page itself on every build, so it never drifts from what customers see.
 *
 * Nothing on it reaches anyone: the scripts that record visits, save
 * half-finished forms, send enquiries, look up addresses and upload files are
 * left out, the ads tag is emptied, it is never indexed, and its free times come
 * from the Lab's managers-only route (public/staff/home-trial.js).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BF_START = '<!-- book-form:start, filled by scripts/build-pages.js -->';
const BF_END = '<!-- book-form:end -->';
const AD_START = '<!-- ads-tag:start, filled by scripts/build-pages.js -->';
const AD_END = '<!-- ads-tag:end -->';
/* The live form's scripts: each one sends something real, so none comes across. */
const LIVE_SCRIPTS = /\s*<script src="\/assets\/(visit|partial|book|address|upload)\.js[^"]*"( defer)?><\/script>/g;

const ARROW = '<svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
const HEAD = { dampscan: ['Book your survey', 'Takes about 30 seconds.'], ati: ['Request your survey', ''] };

/* Step 1 sits where the live form does, in the same card and classes; steps 2 to 4
   open full screen from it (home-trial.js draws them). */
export function trialForm(site) {
  const [h, sub] = HEAD[site] || HEAD.dampscan;
  const brand = site === 'ati' ? ' is-brand' : '';
  return `    <div class="book-card${brand}" id="book">
      <div class="book-body">
      <div class="book-head">
          <h2>${h}</h2>
          ${sub ? `<p>${sub}</p>` : ''}
        </div>
        <div class="dots" role="progressbar" aria-label="Form progress" aria-valuemin="1" aria-valuemax="4" aria-valuenow="1" id="dots">
          <span class="is-done"></span><span></span><span></span><span></span>
          <span class="step-label" id="step-label">Step 1 of 4</span>
        </div>
        <form id="ht-form" novalidate>
          <div class="fstep is-active" data-step="1">
            <div class="two-col">
              <div class="form-row">
                <label for="f-name">First name</label>
                <input id="f-name" type="text" autocomplete="given-name" required />
                <span class="err">Please enter your first name.</span>
              </div>
              <div class="form-row">
                <label for="f-phone">Mobile</label>
                <input id="f-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" required />
                <span class="err">Please enter a UK number, 11 digits, e.g. 07700 900123.</span>
              </div>
            </div>
            <div class="form-row">
              <label for="f-email">Email address</label>
              <input id="f-email" type="email" inputmode="email" autocomplete="email" required />
              <span class="err">Please enter a valid email address.</span>
            </div>
            <div class="form-row addr">
              <label for="f-addr1">Address for the survey</label>
              <div class="addr-fields">
                <input id="f-addr1" type="text" autocomplete="address-line1" placeholder="House number and street" required />
                <span class="err">Please give the address for the survey.</span>
                <div class="two-col">
                  <input id="f-town" type="text" autocomplete="address-level2" placeholder="Town or city" />
                  <input id="f-postcode" type="text" autocomplete="postal-code" placeholder="Postcode" required />
                </div>
                <span class="err" id="f-postcode-err">Please enter the postcode.</span>
              </div>
            </div>
            <div class="form-row">
              <label id="access-label">Who will let us in?</label>
              <div class="access-pick" role="radiogroup" aria-labelledby="access-label">
                <label class="check access-opt"><input type="radio" name="Access" value="Me" id="f-access-me" checked />Me</label>
                <label class="check access-opt"><input type="radio" name="Access" value="The estate agent" id="f-agent-on" />The estate agent</label>
              </div>
            </div>
            <div class="agent-fields" id="f-agent-fields" hidden>
              <div class="form-row">
                <label for="f-agent">Estate agent's name or branch</label>
                <input id="f-agent" type="text" autocomplete="off" />
                <span class="err">Please enter the estate agent's name or branch.</span>
              </div>
              <div class="form-row">
                <label for="f-agent-phone">Agent's phone</label>
                <input id="f-agent-phone" type="tel" inputmode="tel" autocomplete="off" maxlength="16" />
                <span class="err">Please enter a UK number, 11 digits, e.g. 01732 123456.</span>
              </div>
            </div>
            <div class="fnav">
              <button type="button" class="btn btn--primary btn--lg" id="ht-next">Continue ${ARROW}</button>
            </div>
          </div>
        </form>
        <p class="form-foot">We only use your details to arrange your survey. No marketing lists, no third parties.</p>
      </div>
    </div>`;
}

/* The real home page, its form swapped, its live scripts and ads tag out, never indexed. */
export function trialPage(html, site) {
  const from = html.indexOf(BF_START), to = html.indexOf(BF_END);
  const a = html.indexOf(AD_START), b = html.indexOf(AD_END);
  if (from === -1 || to === -1 || a === -1 || b === -1) throw new Error(`${site} home page: markers missing for the trial`);
  let out = html.slice(0, a) + `${AD_START}\n${AD_END}` + html.slice(b + AD_END.length);
  const f2 = out.indexOf(BF_START), t2 = out.indexOf(BF_END);
  out = out.slice(0, f2) + `${BF_START}\n${trialForm(site)}\n    ${BF_END}` + out.slice(t2 + BF_END.length);
  out = out.replace(LIVE_SCRIPTS, '')
    .replace(/<link rel="canonical"[^>]*>\s*/, '')
    /* It lives under /staff/, so a path written relative to the site root is made absolute. */
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow" />')
    .replace('</head>', '<link rel="stylesheet" href="/staff/home-trial.css" />\n</head>')
    .replace('</body>', `<script src="/assets/survey-pick.js"></script>\n<script src="/staff/home-trial-need.js"></script>\n<script src="/staff/home-trial.js" data-site="${site}"></script>\n</body>`);
  return out;
}

/** Written beside the Lab: /staff/home-trial-dampscan.html and /staff/home-trial-ati.html. */
export async function writeTrialHomes(root, home) {
  for (const [site, file] of Object.entries(home)) {
    const html = await readFile(join(root, file), 'utf8');
    await writeFile(join(root, 'public', 'staff', `home-trial-${site}.html`), trialPage(html, site), 'utf8');
  }
}
