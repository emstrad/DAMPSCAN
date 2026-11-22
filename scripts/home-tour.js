/**
 * "Your survey page" on the damp home pages (the owner, 22 Nov 2026): what the
 * customer's own page does, beside a phone cycling through its real screens
 * with subtitles (a demo customer, never a real one), and for ATi a slim line
 * for estate agents. One source for the Lab's staff copy of each home page
 * (trial-home.js) and, once approved, the live pages.
 */
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
const STEPS = ['Pay', 'Move', 'Message', 'On the way', 'Report', 'Quote check'];
const SERVICES = '<!-- ============================= SERVICES ============================= -->';
const AREAS = '<!-- ============================= AREAS WE COVER ============================= -->';

export function tourSection(code) {
  const shots = ITEMS.map((_, i) => `<img src="/assets/tour/${code}-${i + 1}.jpg" alt="" loading="lazy" decoding="async" width="390" height="780" />`).join('');
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
    <div class="yp-phone" aria-hidden="true"><div class="yp-screen">${shots}</div><div class="yp-subs">${SUBS.map((s) => `<span>${s}</span>`).join('')}</div></div>
    <div class="yp-steps" aria-hidden="true">${STEPS.map((s) => `<span>${s}</span>`).join('')}</div>
  </div>
</section>

`;
}

export const agentBand = () => `<!-- ============================= ESTATE AGENTS ============================= -->
<section class="agentband" aria-label="Estate agents">
  <div class="container">
    <p><strong>Estate agent?</strong> <span>Every buyer you send us, on one private page: visits, money and reports, live.</span></p>
    <a href="/estate-agents" class="btn btn--ghost">How it works for agents</a>
  </div>
</section>

`;

/** A home page with the section after How it works, and for ATi the agents line before the areas. */
export function withTour(html, site, { agentHref = '/estate-agents' } = {}) {
  if (!html.includes(SERVICES)) throw new Error(`${site} home page: no services marker for the tour`);
  let out = html.replace(SERVICES, tourSection(site) + SERVICES);
  if (site === 'ati') {
    if (!out.includes(AREAS)) throw new Error('ati home page: no areas marker for the agents line');
    out = out.replace(AREAS, agentBand().replace('href="/estate-agents"', `href="${agentHref}"`) + AREAS);
  }
  return out.replace('</head>', '<link rel="stylesheet" href="/assets/tour.css" />\n<script src="/assets/tour.js" defer></script>\n</head>');
}
