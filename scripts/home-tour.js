/**
 * "Your survey page" on the damp home pages (the owner, 22 Nov 2026): what the
 * customer's own page does, beside a phone cycling through its real screens
 * with subtitles (a demo customer, never a real one), and for ATi a slim line
 * for estate agents. Written into the two hand written home pages between
 * markers on every build (the owner's go-live, 22 Nov 2026), as the booking
 * form and the reviews are.
 */
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/* /assets is cached for a year and the site's own stamps cover only scripts and
   styles, so each screen carries its own content hash: a new screen is seen at
   once (the owner, 22 Nov 2026, saw the old message screen from his phone's cache). */
export const shot = (name) => `/assets/tour/${name}?v=${createHash('sha1').update(readFileSync(new URL(`../public/assets/tour/${name}`, import.meta.url))).digest('hex').slice(0, 8)}`;
const ITEMS = [
  ['Pay the deposit in seconds', 'Apple Pay, Google Pay or card. Your booking is secured there and then.'],
  ['Change your time yourself', 'Pick another free slot whenever plans change. No phone calls.'],
  ['Message us, photos too', 'Ask anything before or after the visit, or send photos of the damp. Our replies stay on your page.'],
  ['See when the surveyor is on the way', 'On the day, your page shows who is coming and when to expect them.'],
  ['Your report the moment it is ready', 'Pay the balance and open the report on your phone.'],
  ['Got a quote for the work? We check it, free', 'Send any quote you are given and we will check it against your report: what it covers, what it misses, what you do not need.']
];
const SUBS = ['Tap Pay with Apple Pay. You\'re booked.', 'Plans changed? Pick a new time yourself.', 'Questions or photos? Message us. Our replies stay here.',
  'On the day, see when your surveyor is on the way.', 'Paid in full? Your report opens right here.', 'Got a quote for the work? Send it. We\'ll check it, free.'];
/* The top of an iPhone above each screen, in the page's own colour (ATi light, DampScan dark):
   the time, the Dynamic Island, signal, wifi and battery. */
const BAR = { ati: '#f5f5f3;--yp-ink:#11213c', dampscan: '#0c1a2b;--yp-ink:#f5f8fc' };
const STATUS = '<div class="yp-status"><b>9:41</b><i class="yp-island"></i><span class="yp-icons">'
  + '<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>'
  + '<svg viewBox="0 0 16 12"><path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.2-1.3A10.5 10.5 0 0 0 8 .8C5.2.8 2.7 1.9.8 3.7L2 5c1.6-1.5 3.7-2.4 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4.4c-1.8 0-3.4.7-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zM8 9.8l2.1-2.2A3 3 0 0 0 8 6.8a3 3 0 0 0-2.1.8z"/></svg>'
  + '<svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="24.6" y="4" width="1.6" height="4" rx=".8" opacity=".4"/></svg>'
  + '</span></div>';
const STEPS = ['Pay', 'Move', 'Message', 'On the way', 'Report', 'Quote check'];
const SERVICES = '<!-- ============================= SERVICES ============================= -->';
const AREAS = '<!-- ============================= AREAS WE COVER ============================= -->';

/** The iPhone around one or more screens (the agents page uses it too). */
export const phone = (code, shots) => `<div class="yp-phone"><div class="yp-screen" style="--yp-bar:${BAR[code]}">${STATUS}<div class="yp-shots">${shots}</div><i class="yp-home"></i></div></div>`;

export function tourSection(code) {
  const shots = ITEMS.map((_, i) => `<img src="${shot(`${code}-${i + 1}.jpg`)}" alt="" loading="lazy" decoding="async" width="390" height="780" />`).join('');
  return `<!-- ============================= YOUR SURVEY PAGE ============================= -->
<section id="your-page" class="yp reveal" aria-labelledby="yp-heading" data-screen-label="Your survey page">
  <div class="container yp-grid">
    <div class="yp-text">
      <span class="eyebrow">Your survey page</span>
      <h2 id="yp-heading" class="h-section">Everything about your survey, on your phone.</h2>
      <p>Book and you get your own private page. No login, no app, no chasing us for updates.</p>
      <ol class="yp-list">
${ITEMS.map(([h, p], i) => `        <li><span class="yp-num">${i + 1}</span><div><strong>${h}</strong><span>${p}</span></div></li>`).join('\n')}
      </ol>
    </div>
    <div class="yp-stage" aria-hidden="true">
      ${phone(code, shots)}
      <div class="yp-subs">${SUBS.map((s) => `<span>${s}</span>`).join('')}</div>
    </div>
    <div class="yp-steps" aria-hidden="true">${STEPS.map((s) => `<span>${s}</span>`).join('')}</div>
  </div>
</section>

`;
}

export const agentBand = () => `<!-- ============================= ESTATE AGENTS ============================= -->
<section class="agentband" aria-label="Estate agents">
  <div class="container">
    <p><strong>Estate agent?</strong> <span>Book a survey in a minute, see every buyer's progress live, and take fewer calls.</span></p>
    <a href="/estate-agents" class="btn btn--ghost">How it works for agents</a>
  </div>
</section>

`;

const YP = ['<!-- your-page:start, filled by scripts/build-pages.js -->', '<!-- your-page:end -->'];
const AG = ['<!-- agent-band:start, filled by scripts/build-pages.js -->', '<!-- agent-band:end -->'];
const fill = (html, [a, b], body, file) => {
  const from = html.indexOf(a), to = html.indexOf(b);
  if (from === -1 || to === -1) throw new Error(`${file}: ${a.slice(5, 20)} markers missing`);
  return html.slice(0, from) + `${a}\n${body}${b}` + html.slice(to + b.length);
};

/** The section after How it works on both home pages, and for ATi the agents line before the areas. */
export async function writeTour(root, homes) {
  for (const [site, file] of Object.entries(homes)) {
    const path = join(root, file);
    let html = fill(await readFile(path, 'utf8'), YP, tourSection(site), file);
    if (site === 'ati') html = fill(html, AG, agentBand(), file);
    await writeFile(path, html, 'utf8');
  }
}
