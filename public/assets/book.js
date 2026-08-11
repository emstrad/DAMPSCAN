/* The booking form, shared by every page on both sites.

   This file is over the 300 line limit the rest of the project keeps to, and
   deliberately so. It is one component: the stepper, its validation, the lead
   post and the held partial are a single piece of behaviour, and the only seam
   available runs straight through showServerErrors. Splitting it would add an
   interface without adding clarity. It is the second documented exception,
   alongside the home pages themselves.

   Requires visit.js, and window.DS_CONFIG for the per site values. It does
   nothing at all on a page with no booking form, so it is safe to load
   everywhere. */
/* ---------- Multi-step booking form ---------- */
(function bookingForm(){
  const card = document.getElementById('book');
  const form = document.getElementById('book-form');
  // Loaded on every page; most of them have no form on it.
  if (!card || !form) return;
  const steps = Array.from(form.querySelectorAll('.fstep'));
  const dots = Array.from(document.querySelectorAll('#dots span:not(.step-label)'));
  const dotsWrap = document.getElementById('dots');
  const label = document.getElementById('step-label');
  let current = 0;

  /* Programmatic focus fires focusin exactly like a tap does, and focusin is
     what records the form as opened. Suppressing it around our own calls is
     what keeps the funnel counting people rather than page loads. */
  let selfFocus = false;
  function focusField(el){
    if (!el) return;
    selfFocus = true;
    el.focus({ preventScroll: true });
    setTimeout(() => { selfFocus = false; }, 0);
  }

  /* focus is opt in. The initial render never focuses: doing so on load opens
     the keyboard on mobile before anyone has asked for it, drops a keyboard
     user into a sidebar form instead of the page they came for, and logs a
     step one entry on every pageview. Advancing a step is different, because
     the visitor pressed the button. */
  function show(i, focus){
    current = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, n) => s.classList.toggle('is-active', n === current));
    dots.forEach((d, n) => d.classList.toggle('is-done', n <= current));
    label.textContent = `Step ${current + 1} of ${steps.length}`;
    dotsWrap.setAttribute('aria-valuenow', String(current + 1));
    if (focus) focusField(steps[current].querySelector('input, select, textarea'));
  }

  function setError(row, on){
    row.classList.toggle('has-err', on);
    const field = row.querySelector('input, select');
    if (field) field.setAttribute('aria-invalid', String(on));
  }

  /* Validate only the visible step */
  function validate(){
    const step = steps[current];
    let ok = true;

    step.querySelectorAll('.form-row').forEach(row => {
      const field = row.querySelector('input[required], select[required]');
      if (field) {
        let bad = !field.value.trim();
        if (!bad && field.type === 'tel') bad = field.value.replace(/\D/g,'').length < 9;
        if (!bad && field.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(field.value.trim());
        setError(row, bad);
        if (bad) { ok = false; track('form_error', { field: (field.id || 'field').replace(/^f-/, '') }); if (ok === false && !step.querySelector('[aria-invalid="true"]:focus')) field.focus(); }
        return;
      }
      /* Only a row marked data-require-one needs a tick. Every other checkbox
         row, such as the previous survey question, is optional. */
      if (!row.hasAttribute('data-require-one')) return;
      const boxes = row.querySelectorAll('input[type="checkbox"]');
      if (boxes.length) {
        const bad = !Array.from(boxes).some(b => b.checked);
        row.classList.toggle('has-err', bad);
        if (bad) { ok = false; track('form_error', { field: 'issues' }); }
      }
    });
    return ok;
  }

  /* Collect the whole form as a flat object; checkboxes join with commas */
  function collect(){
    const data = new FormData(form);
    const out = {};
    for (const [k, v] of data.entries()) {
      if (!String(v).trim()) continue;
      out[k] = out[k] ? out[k] + ', ' + v : v;
    }
    out['Previous survey'] = document.getElementById('f-prev').checked ? 'Yes' : 'No';
    return out;
  }

  /* --- CRM HOOK -------------------------------------------------------
     Replace the body of this function with your CRM / webhook / GA call.
     Fires twice per lead: stage 'partial' (after step 1) and 'complete'. */
  function pushLeadToCRM(payload, stage){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: (DS_CFG.dataLayerEvent || 'dampscan') + '_lead', stage, ...payload });
    /* e.g. fetch('https://your-crm.example/webhook', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({stage, ...payload})}); */
  }

  const val = id => (document.getElementById(id).value || '').trim();

  /* The JSON shape /api/lead expects. The server re-validates all of it. */
  function leadPayload(stage){
    const hp = form.querySelector('input[name="honeypot"]');
    return {
      stage: stage,
      sessionId: DS.id,
      firstName: val('f-name'),
      email: val('f-email'),
      postcode: val('f-postcode'),
      phone: val('f-phone'),
      issues: Array.from(form.querySelectorAll('input[name="Issue"]:checked')).map(b => b.value),
      role: document.getElementById('f-role').value || '',
      previousSurvey: document.getElementById('f-prev').checked,
      notes: val('f-notes'),
      sourcePath: location.pathname,
      referrer: DS.referrer,
      utm: DS.utm,
      landingPage: DS.landingPage,
      honeypot: hp ? hp.value : ''
    };
  }

  /* Server field key -> the input it belongs to, so a 400 lands on the right row. */
  const ERROR_FIELDS = { firstName:'f-name', email:'f-email', postcode:'f-postcode', phone:'f-phone', role:'f-role' };

  function showServerErrors(errors){
    let firstBad = null;
    Object.keys(errors || {}).forEach(key => {
      if (key === 'issues') {
        const issueRow = form.querySelector('.checks').closest('.form-row');
        if (issueRow) { issueRow.classList.add('has-err'); if (!firstBad) firstBad = issueRow; }
        return;
      }
      const field = document.getElementById(ERROR_FIELDS[key] || '');
      const row = field && field.closest('.form-row');
      if (!row) return;
      setError(row, true);
      const err = row.querySelector('.err');
      if (err && errors[key]) err.textContent = errors[key];
      if (!firstBad) firstBad = field;
    });
    if (firstBad) {
      const step = firstBad.closest('.fstep');
      if (step) show(steps.indexOf(step));
      focusField(firstBad);
    }
  }

  /* The notification email is sent from here rather than from our API, because
     FormSubmit sits behind Cloudflare and answers a server-to-server call with a
     bot challenge instead of sending anything. The lead is already stored by
     /api/lead before this runs, so a blocked or abandoned browser costs the
     email, never the enquiry. */
  function emailNotification(stage, id){
    const issues = Array.from(form.querySelectorAll('input[name="Issue"]:checked')).map(b => b.value);
    const who = val('f-name') || 'unknown';
    const where = val('f-postcode') || 'no postcode';
    const payload = {
      _subject: (DS_CFG.subjectPrefix || '')
        + (stage === 'complete' ? 'NEW survey booking, ' : 'PARTIAL lead (step 1), ') + who + ', ' + where,
      _captcha: 'false',
      _template: 'table',
      'First name': val('f-name'),
      Email: val('f-email'),
      Phone: val('f-phone') || 'Not given',
      Postcode: val('f-postcode'),
      Issue: issues.length ? issues.join(', ') : 'Not given yet',
      'Owner or landlord': document.getElementById('f-role').value || 'Not given yet',
      'Previous survey': stage === 'complete' ? (document.getElementById('f-prev').checked ? 'Yes' : 'No') : 'Not asked yet',
      Notes: val('f-notes') || 'None',
      'Lead stage': stage,
      Submitted: new Date().toLocaleString('en-GB'),
      'Lead ID': String(id || '')
    };

    /* Tell our API what happened, so the dashboard shows the truth rather than
       "Pending" forever. Fire and forget, never surfaced to the visitor. */
    const report = (ok, error) => {
      try {
        fetch('/api/notified', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: DS.id, stage: stage, ok: ok, error: error || '' })
        }).catch(function(){});
      } catch (e) {}
    };

    try {
      fetch(NOTIFY_ENDPOINT, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json().catch(function(){ return null; }))
        .then(body => {
          const sent = body && String(body.success).toLowerCase() === 'true';
          report(sent, sent ? '' : (body && body.message) || 'FormSubmit did not confirm the send.');
        })
        .catch(err => report(false, String((err && err.message) || err)));
    } catch (e) {
      report(false, String(e && e.message || e));
    }
  }

  /* Returns { ok, errors }. A network failure resolves ok, so the visitor is
     never trapped by something that is not their fault. A 400 does not, because
     the fields genuinely need fixing. */
  async function sendLead(stage){
    pushLeadToCRM(collect(), stage);
    try {
      const res = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(leadPayload(stage))
      });
      if (res.status === 400) {
        const body = await res.json().catch(function(){ return null; });
        return { ok: false, errors: (body && body.errors) || {} };
      }
      const saved = await res.json().catch(function(){ return null; });
      emailNotification(stage, saved && saved.id);
    } catch (err) {
      /* Offline/preview or network blocked: the UI still advances so the visitor is never stuck */
      console.warn('Lead POST failed (stage: ' + stage + ')', err);
    }
    return { ok: true, errors: {} };
  }

  /* --- PARTIAL LEAD ---------------------------------------------------
     Step 1 gives us enough to call someone back, but a visitor who carries on
     and books is not a partial at all. So the partial is armed once they pass
     step 1 and then held back: it is only sent if they really do leave it
     there, either by leaving the page or by going quiet for a long time with
     the form still open. Submitting cancels it, so a booked survey never
     arrives twice. */
  const PARTIAL_IDLE_MS = 180000;
  const PARTIAL_HIDDEN_MS = 45000;
  let partialArmed = false;
  let partialDone = false;
  let idleTimer = 0;
  let hiddenTimer = 0;

  function armPartial(){
    if (partialDone) return;
    partialArmed = true;
    bumpIdle();
  }

  function cancelPartial(){
    partialArmed = false;
    partialDone = true;
    clearTimeout(idleTimer);
    clearTimeout(hiddenTimer);
  }

  function bumpIdle(){
    clearTimeout(idleTimer);
    if (!partialArmed) return;
    idleTimer = setTimeout(() => flushPartial(false), PARTIAL_IDLE_MS);
  }

  /* leaving means the page is on its way out, so the request has to be a
     beacon: an ordinary fetch is routinely killed mid-flight during unload.
     The lead still reaches the dashboard, it just cannot report back on the
     notification email the way an idle flush can. */
  function flushPartial(leaving){
    if (!partialArmed || partialDone) return;
    partialArmed = false;
    partialDone = true;
    clearTimeout(idleTimer);
    clearTimeout(hiddenTimer);
    if (leaving && navigator.sendBeacon) {
      const body = new Blob([JSON.stringify(leadPayload('partial'))], { type: 'application/json' });
      navigator.sendBeacon(LEAD_ENDPOINT, body);
      return;
    }
    sendLead('partial');
  }

  /* pagehide is the last reliable moment before the page goes. A tab switch
     only counts once they have stayed away a while, so glancing at another tab
     and coming back to finish does not produce a partial. */
  window.addEventListener('pagehide', () => flushPartial(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (partialArmed) hiddenTimer = setTimeout(() => flushPartial(true), PARTIAL_HIDDEN_MS);
      return;
    }
    clearTimeout(hiddenTimer);
    bumpIdle();
  });

  form.addEventListener('click', e => {
    if (e.target.closest('[data-next]')) {
      if (!validate()) return;
      /* Step 1 complete = usable lead, but only worth sending if they abandon it. */
      if (current === 0) armPartial();
      show(current + 1, true);
      track('form_step', { step: current + 1 });
    }
    if (e.target.closest('[data-back]')) show(current - 1, true);
  });

  /* form_open once per visit, plus step 1 so the funnel has a first rung. */
  let formOpened = false;
  form.addEventListener('focusin', () => {
    if (selfFocus || formOpened) return;
    formOpened = true;
    track('form_open');
    track('form_step', { step: 1 });
  });

  /* Clear the error as soon as they start fixing it, and keep the partial
     lead on hold for as long as they are still working on the form. */
  form.addEventListener('input', e => {
    bumpIdle();
    const row = e.target.closest('.form-row');
    if (row) setError(row, false);
  });
  form.addEventListener('change', e => {
    bumpIdle();
    const row = e.target.closest('.form-row');
    if (row && e.target.type === 'checkbox') row.classList.remove('has-err');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validate()) return;
    /* They are booking, so the held partial is not a partial. Drop it. */
    cancelPartial();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.style.opacity = '.7';
    const result = await sendLead('complete');
    if (!result.ok) {
      /* Server rejected a field, so nothing was written. Put the partial back
         on hold as a fallback, then point at the problem. */
      partialDone = false;
      armPartial();
      btn.disabled = false;
      btn.style.opacity = '';
      showServerErrors(result.errors);
      return;
    }
    track('form_submit');
    card.classList.add('is-sent');
    card.querySelector('.book-success h3').focus?.();
  });

  /* Action-bar / CTA taps land on the form with the first field focused */
  document.addEventListener('click', e => {
    if (e.target.closest('a[href="#book"]')) {
      setTimeout(() => {
        if (card.classList.contains('is-sent')) return;
        if (window.matchMedia('(min-width: 821px)').matches) {
          focusField(steps[current].querySelector('input, select, textarea'));
        }
      }, 620);
    }
  });

  show(0, false);
})();
