/**
 * The booking form markup, for every page on both sites including the two home
 * pages, which build-pages.js writes this into between markers. It used to be
 * copied by hand into public/index.html and public/london.html, and the copies
 * drifted: the home pages reworded their buttons and success message while the
 * generated pages kept DampScan's wording on both sites, so ATi's area pages
 * offered to "book" a survey the company does not book. One source now.
 *
 * The ids and classes are load bearing: public/assets/book.js drives all of
 * them and it is the same script every page loads. One form, one
 * implementation, four dozen pages.
 */

import { enquiryFor } from '../lib/enquiry.js';

/* The wording is the only thing that differs between the sites, because the
   businesses differ. DampScan books a survey and then does the remedial work;
   ATi is survey only and issues a report, so it requests rather than books. */
const COPY = {
  dampscan: {
    heading: 'Book your survey',
    sub: 'Takes about 30 seconds.',
    start: 'Get My Survey Booked',
    previous: "I've had a damp survey on this property before",
    submit: 'Book My Survey',
    foot: 'We only use your details to arrange your survey. No marketing lists, no third parties.',
    doneTitle: "Got it, you're booked in.",
    doneBody: 'One of our surveyors will contact you today to confirm a time. Nothing else to do for now.',
    issueLabel: 'What are you dealing with? Tick anything that applies.',
    addressLabel: 'Address for the survey',
    addressErr: 'Please give the address for the survey.',
    filesSummary: 'Add photos or a previous report',
    filesLabel: 'Previous surveys or photos',
    filesHint: `Up to 10 photos or PDFs, 25MB each. An earlier report or a
                  shot of the affected wall often says more than a paragraph.`
  },
  ati: {
    heading: 'Request your survey',
    sub: '',
    start: 'Get My Report Started',
    previous: "I've had a damp survey or report on this property before",
    submit: 'Request My Survey',
    foot: 'Your details arrange your survey and nothing else. No marketing lists, no contractor referrals.',
    doneTitle: "Received. We're on it.",
    doneBody: 'A surveyor will reply today to arrange the inspection. Your written report follows within 24 hours of that visit.',
    issueLabel: 'What are you dealing with? Tick anything that applies.',
    addressLabel: 'Address for the survey',
    addressErr: 'Please give the address for the survey.',
    filesSummary: 'Add photos or a previous report',
    filesLabel: 'Previous surveys or photos',
    filesHint: `Up to 10 photos or PDFs, 25MB each. An earlier report or a
                  shot of the affected wall often says more than a paragraph.`
  },
  /* Quoted trades. Nothing is booked on the form, because nothing can be
     priced until somebody has looked, so the promise is the visit and the
     written quote rather than a survey. */
  roofing: {
    heading: 'Get your free quote',
    sub: 'Three short steps. We reply the same day.',
    start: 'Start My Quote',
    previous: "I've had a quote for this work before",
    submit: 'Send My Enquiry',
    foot: 'Your details price your job and nothing else. No marketing lists, no lead brokers.',
    doneTitle: "Received. We're on it.",
    doneBody: 'We will reply today, come out and look for nothing, and put a fixed price in writing within 48 hours of the visit.',
    issueLabel: 'What is the roof doing? Tick anything that applies.',
    addressLabel: 'Address of the property',
    addressErr: 'Please give the address of the property.',
    filesSummary: 'Add photos or a previous quote',
    filesLabel: 'Photos or a previous quote',
    filesHint: `Up to 10 photos or PDFs, 25MB each. A photo of the roof often means
                  we can price it over the phone, and it always makes us quicker when we come out.`
  },
  ac: {
    heading: 'Get a free quote visit',
    sub: 'Three short steps. We reply the same day.',
    start: 'Start My Quote',
    previous: "I've had a quote for this work before",
    submit: 'Send My Enquiry',
    foot: 'Your details price your job and nothing else. No marketing lists, no lead brokers.',
    doneTitle: "Received. We're on it.",
    doneBody: 'We will reply today and arrange a free visit. The written quote that follows is fixed.',
    issueLabel: 'What are you trying to solve? Tick anything that applies.',
    addressLabel: 'Address of the property',
    addressErr: 'Please give the address of the property.',
    filesSummary: 'Add photos or a previous quote',
    filesLabel: 'Photos or a previous quote',
    filesHint: `Up to 10 photos or PDFs, 25MB each. A photo of the room and of where an
                  outdoor unit could go often lets us quote without a second visit.`
  }
};

const TICK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/* One checkbox per issue the brand's validator accepts, from the same list, so
   the form can never offer something the server refuses. Whitespace matches
   what was hand written here, so the damp pages do not move. */
function issueBoxes(site) {
  return enquiryFor(site).issues
    .map((issue) => `<label class="check"><input type="checkbox" name="Issue" value="${issue}" /><span class="box">${TICK}</span>${issue}</label>`)
    .join('\n                ');
}

export function bookForm(site) {
  const brand = site === 'ati' ? ' is-brand' : '';
  const t = COPY[site];
  if (!t) throw new Error(`book form: no wording for site "${site}"`);
  return `    <div class="book-card${brand}" id="book">
      <div class="book-body">
      <div class="book-head">
          <h2>${t.heading}</h2>${t.sub ? `
          <p>${t.sub}</p>` : ''}
        </div>
        <div class="dots" role="progressbar" aria-label="Form progress" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" id="dots">
          <span class="is-done"></span><span></span><span></span>
          <span class="step-label" id="step-label">Step 1 of 3</span>
        </div>

        <form id="book-form" novalidate>
          <!-- Bot trap. Hidden from sight and from the tab order, so only a script fills it in. -->
          <div class="sr-only" aria-hidden="true">
            <label for="f-hp">Leave this field empty</label>
            <input id="f-hp" name="honeypot" type="text" tabindex="-1" autocomplete="off" />
          </div>
          <!-- STEP 1, the lead capture. Name + phone + postcode is enough to follow up. -->
          <div class="fstep is-active" data-step="1">
            <div class="form-row">
              <label for="f-name">First name</label>
              <input id="f-name" name="First name" type="text" autocomplete="given-name" required />
              <span class="err">Please enter your first name.</span>
            </div>
            <div class="two-col">
              <div class="form-row">
                <label for="f-email">Email address</label>
                <input id="f-email" name="Email" type="email" inputmode="email" autocomplete="email" required />
                <span class="err">Please enter a valid email address.</span>
              </div>
              <div class="form-row">
                <label for="f-postcode">Postcode</label>
                <input id="f-postcode" name="Postcode" type="text" autocomplete="postal-code" required />
                <span class="err">Please enter your postcode.</span>
              </div>
            </div>
            <div class="fnav">
              <button type="button" class="btn btn--primary btn--lg" data-next>
                ${t.start}
                <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>

          <!-- STEP 2, issue type -->
          <div class="fstep" data-step="2">
            <div class="form-row" data-require-one>
              <label id="issue-label">${t.issueLabel}</label>
              <div class="checks" role="group" aria-labelledby="issue-label">
                ${issueBoxes(site)}
              </div>
              <span class="err">Pick at least one, "Not sure" is fine.</span>
            </div>
            <div class="fnav">
              <button type="button" class="back-link" data-back>← Back</button>
              <button type="button" class="btn btn--primary btn--lg" data-next>
                Continue
                <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>

          <!-- STEP 3, qualify + optional detail -->
          <div class="fstep" data-step="3">
            <div class="form-row addr">
              <label for="f-addr1">${t.addressLabel}</label>
              <div class="addr-find">
                <input id="f-addr-pc" name="Lookup postcode" type="text" autocomplete="postal-code"
                  aria-label="Postcode to look up" placeholder="Postcode" />
                <button type="button" class="btn addr-btn" id="f-addr-find">Find address</button>
              </div>
              <p class="addr-status" id="f-addr-status" role="status"></p>
              <div class="form-row addr-pick" id="f-addr-pick" hidden>
                <label for="f-addr-select">Pick your address</label>
                <select id="f-addr-select"></select>
              </div>
              <!-- Shown instead of the three fields once the picker has filled them,
                   so a found address is one line rather than three boxes. -->
              <p class="addr-chosen" id="f-addr-chosen" tabindex="-1" hidden>
                <span id="f-addr-chosen-text"></span>
                <button type="button" class="link-btn" id="f-addr-change">Change</button>
              </p>
              <div class="addr-fields" id="f-addr-fields">
                <input id="f-addr1" name="Address line 1" type="text" autocomplete="address-line1"
                  placeholder="House number and street" required />
                <span class="err">${t.addressErr}</span>
                <input id="f-town" name="Town" type="text" autocomplete="address-level2"
                  placeholder="Town or city" />
                <!-- Asked again here, below the town, because this is the postcode of
                     the property being surveyed and the one on step 1 is whatever they
                     typed to get started. Prefilled from it, so for almost everybody it
                     is already right and there is nothing to do. -->
                <input id="f-addr-postcode" name="Address postcode" type="text"
                  autocomplete="postal-code" aria-label="Postcode" placeholder="Postcode" />
              </div>
            </div>
            <div class="form-row">
              <label class="check" for="f-prev"><input type="checkbox" id="f-prev" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>${t.previous}</label>
            </div>
            <div class="form-row">
              <label for="f-phone">Phone number <span class="opt">(optional, quickest way to confirm a time)</span></label>
              <input id="f-phone" name="Phone" type="tel" inputmode="tel" autocomplete="tel" />
            </div>
            <details class="fold">
              <summary>${t.filesSummary} <span class="opt">(optional)</span></summary>
              <div class="form-row">
                <label for="f-files" class="sr-only">${t.filesLabel}</label>
                <input id="f-files" name="Files" type="file" multiple
                  accept="image/jpeg,image/png,image/heic,image/webp,application/pdf" />
                <p class="file-hint">${t.filesHint}</p>
                <ul class="file-list" id="f-file-list" aria-live="polite"></ul>
              </div>
            </details>
            <details class="fold">
              <summary>Anything else we should know? <span class="opt">(optional)</span></summary>
              <div class="form-row">
                <label for="f-notes" class="sr-only">Anything we should know?</label>
                <textarea id="f-notes" name="Notes" rows="3" placeholder="Property type, where the problem is, when it started…"></textarea>
              </div>
            </details>
            <!-- What the submit button is saying, for anyone not looking at it. -->
            <p class="sr-only" role="status" id="submit-status"></p>
            <div class="fnav">
              <button type="button" class="back-link" data-back>← Back</button>
              <button type="submit" class="btn btn--primary btn--lg">
                ${t.submit}
                <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        </form>
        <p class="form-foot">${t.foot}</p>
      </div>

      <div class="book-success" role="status">
        <div class="check-ring" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3>${t.doneTitle}</h3>
        <p>${t.doneBody}</p>
      </div>
    </div>`;
}
