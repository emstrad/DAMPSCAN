/**
 * The estate agents page on ATi (the owner, 22 Nov 2026: "add the estate agent
 * portal"): what an agent gets from their own private page, a phone showing
 * it (a demo agent and made-up buyers, never real ones), and how to get one.
 * Agents are a different audience from buyers, so this is its own page,
 * linked from a slim line on the home page rather than a home page section.
 */
import { shell } from './page-shell.js';
import { SITES } from './sites.js';
import { phone, shot } from './home-tour.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const GETS = [
  ['Book a survey in under a minute', 'Quick book takes the address, your buyer\'s name and mobile, and who lets us in. Pick the survey and a time there and then, and it is booked.'],
  ['Your buyer gets their own page', 'They pay the deposit, change the time and message us from it. Nothing is passed back through you.'],
  ['Your buyer is kept updated by text', 'Booked, paid, the morning of the visit, the report ready. They hear it from us, so they don\'t ring you to ask.'],
  ['The whole journey, every property', 'Booked, surveyed, report ready, and what has been paid, live on one page for every buyer you send.'],
  ['See what is holding things up', 'A deposit not paid, a visit time waiting on you, a balance due before the report: flagged at a glance, so you know who to nudge.'],
  ['Confirm access in one tap', 'When you hold the keys, confirm the time we asked for, or offer another. No phone tag.'],
  ['The report as soon as it is paid for', 'Open it yourself from your page and keep the sale moving. No waiting for it to be forwarded.'],
  ['Nothing to set up', 'One private link, kept on your phone. No login, no app, no cost to the agent.']
];
/* The calls the page answers for them, said as the agent would ask them. */
const CALLS = ['Has the buyer booked yet?', 'Have they paid?', 'Can they move the time?', 'When are you going in?', 'Where is the report?'];

export function renderAgents(site = SITES.ati) {
  const url = `${site.origin}/estate-agents`;
  const ask = `<div class="ag-ctas"><a class="btn btn--primary" href="tel:${site.phone}">Call ${site.phoneLabel}</a>${site.email ? `<a class="btn btn--ghost" href="mailto:${site.email}?subject=Estate%20agent%20page">Email us</a>` : ''}</div>`;
  const body = `<div class="ag-page">
  <div class="ag-top">
    <div class="hero">
      <h1>Book a damp survey in a minute. We handle the rest.</h1>
      <p class="lede">Quick book from your own page and your buyer gets theirs: they pay, move the time and message us there, and you watch every property move from booked to report, live. Fewer calls, no chasing.</p>
      <div class="booking ag-ask">
        <h2>Ask for your page</h2>
        <p>Quick book, live progress, fewer calls. Your branch has its page today.</p>
        ${ask}
      </div>
    </div>
    <div class="yp-stage" aria-hidden="true">${phone('ati', `<img src="${shot('agent-1.jpg')}" alt="" decoding="async" width="390" height="780" />`)}</div>
  </div>

  <section class="sec">
    <h2>What your page does for you</h2>
    <ol class="yp-list ag-list">
      ${GETS.map(([h, p], i) => `<li><span class="yp-num">${i + 1}</span><div><strong>${h}</strong><span>${p}</span></div></li>`).join('\n      ')}
    </ol>
  </section>

  <section class="sec ag-pair">
    <div>
      <h2>The calls you stop making</h2>
      <ul class="ag-calls">${CALLS.map((c) => `<li>${c}</li>`).join('')}</ul>
      <p>Every one of these is answered on your page, the moment it changes. Your buyer has the same answers on theirs.</p>
    </div>
    <div>
      <h2>A report the seller can trust</h2>
      <p>${site.brand} is independent: we sell no damp treatment, so nobody can say the report was written to sell work. Your buyer gets a clear answer, and the negotiation stays on the facts.</p>
    </div>
  </section>

  <section class="sec ag-end">
    <h2>Get your page today</h2>
    <p>Call or email with your branch name. We send your page link the same day, with your own booking link for buyers, so every survey you send is put down to you.</p>
    ${ask}
  </section>
  </div>`;
  /* No side column here (the owner, 22 Nov 2026): it is not a booking page, only a call or email, so the page runs full width. */
  const aside = '';
  return shell({
    site, url,
    title: `For Estate Agents: Quick Book Damp Surveys | ${site.brand}`,
    metaDescription: `Estate agents in London: quick book a damp survey in a minute. Your buyer gets their own page; you see every property live, with fewer calls.`,
    body, aside, scripts: '', styles: ['/assets/tour.css', '/assets/agents-page.css']
  });
}

/** ATi's estate agents page, served at /estate-agents on ATi's host only (middleware.js). */
export async function writeAgentsPage(root) {
  const dir = join(root, 'public', 'hubs', 'ati');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'estate-agents.html'), renderAgents(), 'utf8');
}
