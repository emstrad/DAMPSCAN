/**
 * The booking form markup, so the area and service pages carry the same form as
 * the home pages rather than a link back to them.
 *
 * Taken verbatim from public/index.html, which is why the ids and classes match
 * exactly: public/assets/book.js drives all of them, and it is the same script
 * the home pages load. One form, one implementation, four dozen pages.
 */
export function bookForm(site) {
  const brand = site === 'ati' ? ' is-brand' : '';
  return `    <div class="book-card${brand}" id="book">
      <div class="book-body">
      <div class="book-head">
          <h2>Book your survey</h2>
          <p>Takes about 30 seconds.</p>
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
                Get My Survey Booked
                <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>

          <!-- STEP 2, issue type -->
          <div class="fstep" data-step="2">
            <div class="form-row" data-require-one>
              <label id="issue-label">What are you dealing with? Tick anything that applies.</label>
              <div class="checks" role="group" aria-labelledby="issue-label">
                <label class="check"><input type="checkbox" name="Issue" value="Damp" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>Damp</label>
                <label class="check"><input type="checkbox" name="Issue" value="Mould" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>Mould</label>
                <label class="check"><input type="checkbox" name="Issue" value="Timber / Woodworm" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>Timber / Woodworm</label>
                <label class="check"><input type="checkbox" name="Issue" value="Leak / Water damage" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>Leak / Water damage</label>
                <label class="check"><input type="checkbox" name="Issue" value="Cold / condensation" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>Cold / condensation</label>
                <label class="check"><input type="checkbox" name="Issue" value="Not sure" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>Not sure</label>
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
            <div class="form-row">
              <label for="f-role">Are you the owner or the landlord?</label>
              <select id="f-role" name="Owner or landlord" required>
                <option value="" disabled selected>Select one…</option>
                <option>Homeowner</option>
                <option>Landlord</option>
                <option>Letting agent / managing agent</option>
                <option>Tenant</option>
                <option>Buying the property</option>
              </select>
              <span class="err">Please choose one.</span>
            </div>
            <div class="form-row">
              <label class="check" for="f-prev"><input type="checkbox" id="f-prev" /><span class="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>I've had a damp survey on this property before</label>
            </div>
            <div class="form-row">
              <label for="f-phone">Phone number <span class="opt">(optional, quickest way to confirm a time)</span></label>
              <input id="f-phone" name="Phone" type="tel" inputmode="tel" autocomplete="tel" />
            </div>
            <div class="form-row">
              <label for="f-notes">Anything we should know? <span class="opt">(optional)</span></label>
              <textarea id="f-notes" name="Notes" rows="3" placeholder="Property type, where the problem is, when it started…"></textarea>
            </div>
            <div class="fnav">
              <button type="button" class="back-link" data-back>← Back</button>
              <button type="submit" class="btn btn--primary btn--lg">
                Book My Survey
                <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        </form>
        <p class="form-foot">We only use your details to arrange your survey. No marketing lists, no third parties.</p>
      </div>

      <div class="book-success" role="status">
        <div class="check-ring" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3>Got it, you're booked in.</h3>
        <p>One of our surveyors will contact you today to confirm a time. Nothing else to do for now.</p>
      </div>
    </div>`;
}
