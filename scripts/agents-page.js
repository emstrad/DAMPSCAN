/**
 * The estate agents page on ATi (the owner, 22 Nov 2026: "add the estate agent
 * portal"): what an agent gets from their own private page, a phone showing
 * it (a demo agent and made-up buyers, never real ones), and how to get one.
 * Agents are a different audience from buyers, so this is its own page,
 * linked from a slim line on the home page rather than a home page section.
 */
import { shell } from './page-shell.js';
import { SITES } from './sites.js';
import { phone } from './home-tour.js';

const GETS = [
  ['Every buyer in one place', 'Each property you send us or let us into, with its stage at a glance: booked, surveyed, report ready.'],
  ['Visits you can confirm', 'When you hold the keys, confirm the time we asked for, or offer another, in one tap.'],
  ['Money and reports, live', 'See what the buyer has paid, and open the report as soon as it is paid for, exactly as they can.'],
  ['Book in under a minute', 'Quick book takes the address, the buyer and who lets us in. The buyer chooses their own survey and time.'],
  ['No login to forget', 'One private link, kept on your phone. Nothing to install, nothing for the branch to set up.']
];

export function renderAgents(site = SITES.ati) {
  const url = `${site.origin}/estate-agents`;
  const body = `
  <div class="hero">
    <h1>Every buyer you send us, on one page</h1>
    <p class="lede">Your branch gets its own private page: every survey you send ${site.brand} or let us into, the visit, the money and the report, kept up to date by itself. No more chasing us, or your buyer, for where things stand.</p>
  </div>

  <section class="sec">
    <h2>What your page shows</h2>
    <div class="ag-grid">
      <ol class="yp-list ag-list">
        ${GETS.map(([h, p], i) => `<li><span class="yp-num">${i + 1}</span><div><strong>${h}</strong><span>${p}</span></div></li>`).join('\n        ')}
      </ol>
      <div class="yp-stage" aria-hidden="true">${phone('ati', '<img src="/assets/tour/agent-1.jpg" alt="" decoding="async" width="390" height="780" />')}</div>
    </div>
  </section>

  <section class="sec">
    <h2>Why buyers you send are looked after</h2>
    <p>Your buyer gets their own page too: the deposit by Apple Pay, their time moved without a phone call, a text when the surveyor is on the way, and the report the moment it is paid for. ${site.brand} is independent: we sell no damp treatment, so the report is one your buyer, and the seller, can trust.</p>
  </section>

  <section class="sec">
    <h2>Getting your page</h2>
    <p>Call us on <a href="tel:${site.phone}">${site.phoneLabel}</a>${site.email ? ` or email <a href="mailto:${site.email}">${site.email}</a>` : ''} with your branch name. We send your page link the same day, with your own booking link for buyers, so every survey you send is put down to you. There is no cost to the agent.</p>
  </section>`;
  const aside = `
    <div class="booking">
      <h2>Ask for your page</h2>
      <p>One call, and your branch has its page today.</p>
      <a class="btn btn--primary" href="tel:${site.phone}">Call ${site.phoneLabel}</a>
      ${site.email ? `<a class="btn btn--ghost" href="mailto:${site.email}?subject=Estate%20agent%20page">Email us</a>` : ''}
    </div>`;
  return shell({
    site, url,
    title: `For Estate Agents: Your Own Buyer Page | ${site.brand}`,
    metaDescription: `Estate agents in London: one private page for every buyer you send ${site.brand}, with visits, payments and reports kept up to date.`,
    body, aside, scripts: '', styles: ['/assets/tour.css', '/assets/agents-page.css']
  });
}
