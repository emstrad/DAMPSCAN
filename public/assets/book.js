/* The booking form, shared by every page on both sites.

   This file is over the 300 line limit the rest of the project keeps to, and
   deliberately so. It is one component: the stepper, its validation and the
   lead post are a single piece of behaviour, and the only seam left runs
   straight through showServerErrors. The held partial, the address lookup and
   the attachments each had a real seam and each live in their own file. It is
   the second documented exception, alongside the home pages themselves.

   Requires visit.js and partial.js before it, and window.DS_CONFIG for the per
   site values. It does nothing at all on a page with no booking form, so it is
   safe to load everywhere. */
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
    /* Optional sections are folded away, and a field inside a closed <details>
       cannot be focused. Anything pointing at one has to open it first, or a
       validation error lands somewhere nobody can see. */
    let fold = el.closest('details');
    while (fold) { fold.open = true; fold = fold.parentElement.closest('details'); }
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
    /* address.js and upload.js stand on their own, so this is how they learn a
       step has changed without reaching into this file. */
    form.dispatchEvent(new CustomEvent('ds:step', { detail: { step: current + 1 } }));
  }

  function setError(row, on){
    row.classList.toggle('has-err', on);
    const field = row.querySelector('[required]') || row.querySelector('input, select');
    if (field) field.setAttribute('aria-invalid', String(on));
  }

  /* Format checks for a field that may be empty but must be right when it is
     not. The server does the same, but by the time it answers the files have
     already been uploaded and the visitor has waited for nothing. */
  function formatBad(field){
    const v = field.value.trim();
    if (!v) return false;
    if (field.type === 'tel') return v.replace(/\D/g, '').length < 9;
    if (field.type === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    return false;
  }

  /* Validate only the visible step */
  function validate(){
    const step = steps[current];
    let ok = true;

    step.querySelectorAll('.form-row').forEach(row => {
      const field = row.querySelector('input[required], select[required]')
        || row.querySelector('input[type="tel"], input[type="email"]');
      if (field) {
        const bad = (field.required && !field.value.trim()) || formatBad(field);
        setError(row, bad);
        if (bad) { ok = false; track('form_error', { field: (field.id || 'field').replace(/^f-/, '') }); if (!step.querySelector('[aria-invalid="true"]:focus')) focusField(field); }
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

  /* Blob pathnames for whatever upload.js managed to store, filled in on
     submit. upload.js remembers what it has already sent, so a submission the
     server bounces and a second attempt does not upload the same photos twice. */
  let uploaded = [];

  /* The JSON shape /api/lead expects. The server re-validates all of it. */
  function leadPayload(stage){
    const hp = form.querySelector('input[name="honeypot"]');
    return {
      stage: stage,
      sessionId: DS.id,
      firstName: val('f-name'),
      email: val('f-email'),
      postcode: val('f-postcode'),
      addressLine1: val('f-addr1'),
      addressLine2: val('f-addr2'),
      town: val('f-town'),
      files: uploaded,
      phone: val('f-phone'),
      issues: Array.from(form.querySelectorAll('input[name="Issue"]:checked')).map(b => b.value),
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
  const ERROR_FIELDS = { firstName:'f-name', email:'f-email', postcode:'f-postcode', phone:'f-phone' };

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
      /* The address is the whole point of asking for it: it needs to be in the
         email as well as the dashboard, or somebody still chases it. */
      Address: [val('f-addr1'), val('f-addr2'), val('f-town')].filter(Boolean).join(', ') || 'Not given yet',
      /* Links rather than the files themselves, because the blobs are private
         and the email is sent from the browser through FormSubmit, which
         cannot carry them. Each link goes to /api/admin/attachment, so it
         opens for a signed-in staff member and for nobody else. That is the
         point: a forwarded email does not leak somebody's survey. */
      ...(uploaded.length
        ? Object.fromEntries(uploaded.map((p, i) => [
            'Attachment ' + (i + 1),
            location.origin + '/api/admin/attachment?path=' + encodeURIComponent(p)
          ]))
        : { Attachments: 'None' }),
      Issue: issues.length ? issues.join(', ') : 'Not given yet',
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

  /* The held partial lives in partial.js. It is handed how to build and send
     the payload and told three things from here: they passed step 1, they
     submitted, they are still typing. Absent, the form still books; it just
     stops reporting abandonments. */
  const partial = window.DS_HELD_PARTIAL
    ? window.DS_HELD_PARTIAL({
        payload: () => leadPayload('partial'),
        send: () => sendLead('partial'),
        endpoint: LEAD_ENDPOINT
      })
    : { arm(){}, cancel(){}, bump(){}, rearm(){} };

  function advance(){
    if (!validate()) return;
    /* Step 1 complete = usable lead, but only worth sending if they abandon it. */
    if (current === 0) partial.arm();
    show(current + 1, true);
    track('form_step', { step: current + 1 });
  }

  form.addEventListener('click', e => {
    if (e.target.closest('[data-next]')) advance();
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
    partial.bump();
    const row = e.target.closest('.form-row');
    if (row) setError(row, false);
  });
  form.addEventListener('change', e => {
    partial.bump();
    const row = e.target.closest('.form-row');
    if (row && e.target.type === 'checkbox') row.classList.remove('has-err');
  });

  let submitting = false;
  const progress = document.getElementById('submit-status');
  const announce = (text) => { if (progress) progress.textContent = text; };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    /* The only submit button is on the last step, so Enter in a field on an
       earlier one reaches here as an implicit submission. It means "next". */
    if (current < steps.length - 1) { advance(); return; }
    if (submitting) return;
    if (!validate()) return;
    submitting = true;
    /* They are booking, so the held partial is not a partial. Drop it. */
    partial.cancel();
    const btn = form.querySelector('[type="submit"]');
    const btnLabel = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '.7';

    /* Files go up before the lead, so the lead row can name them, and the
       button says what is happening because shrinking and sending a phone
       photo is a wait.
       Nothing here can fail the booking: upload.js never rejects, and anything
       that did not store is reported as a note rather than as an error. */
    let filesFailed = 0;
    if (window.DS_UPLOAD) {
      const done = await window.DS_UPLOAD((n, total) => {
        const text = `Sending file ${n} of ${total}…`;
        btn.textContent = text;
        announce(text);
      });
      uploaded = done.paths;
      filesFailed = done.failed;
      btn.innerHTML = btnLabel;
    }
    announce('Sending your booking…');

    const result = await sendLead('complete');
    submitting = false;
    announce('');
    if (!result.ok) {
      /* Server rejected a field, so nothing was written. Put the partial back
         on hold as a fallback, then point at the problem. */
      partial.rearm();
      btn.disabled = false;
      btn.style.opacity = '';
      showServerErrors(result.errors);
      return;
    }
    track('form_submit');
    /* Said on the confirmation rather than as a field error, because the form
       is gone by now. They are booked either way, so the wording is a next
       step and not an apology for something they need to fix. */
    if (filesFailed) {
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = filesFailed === 1
        ? 'One of your files did not come through. Reply to your confirmation email with it and we will add it to the job.'
        : `${filesFailed} of your files did not come through. Reply to your confirmation email with them and we will add them to the job.`;
      card.querySelector('.book-success').appendChild(note);
    }
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
