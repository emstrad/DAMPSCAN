/**
 * The damp sites' booking form (the owner's brief, 15 Nov 2026; live from
 * 16 Nov): step 1 in the usual card and classes, written into every ATi and
 * DampScan page by scripts/book-form.js. The steps after it are drawn by
 * public/assets/bf.js. The ids are load bearing: bf.js reads them.
 */
const ARROW = '<svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
const HEAD = { dampscan: ['Book your survey', 'Takes about 30 seconds.'], ati: ['Request your survey', ''] };

/* The damp sites' booking form (the owner's brief, 15 Nov 2026): step 1 in the
   usual card and classes; the steps after it grow across the hero
   (public/assets/bf.js draws them). Its own heading: it never claimed to book work. */
export function dampForm(site) {
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
          <!-- Bot trap. Hidden from sight and from the tab order, so only a script fills it in. -->
          <div class="sr-only" aria-hidden="true">
            <label for="f-hp">Leave this field empty</label>
            <input id="f-hp" name="honeypot" type="text" tabindex="-1" autocomplete="off" />
          </div>
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
            <div class="two-col">
              <div class="form-row">
                <label for="f-email">Email address</label>
                <input id="f-email" type="email" inputmode="email" autocomplete="email" required />
                <span class="err">Please enter a valid email address.</span>
              </div>
              <div class="form-row">
                <label for="f-postcode">Postcode</label>
                <input id="f-postcode" type="text" autocomplete="postal-code" required />
                <span class="err">Please enter the postcode.</span>
              </div>
            </div>
            <div class="form-row">
              <label for="f-addr1">Address for the survey</label>
              <div class="two-col">
                <input id="f-addr1" type="text" autocomplete="address-line1" placeholder="House number and street" required />
                <input id="f-town" type="text" autocomplete="address-level2" placeholder="Town or city" />
              </div>
              <span class="err">Please give the address for the survey.</span>
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
