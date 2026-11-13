/* Reports to send: each survey done and not yet reported, oldest first, with
   its countdown, the report file (or an upload), Report ready (texts the
   customer their page, which unlocks it once paid in full), Hold (keeps it
   locked and quiet), a ChatGPT link that drafts the final email in Outlook,
   and the Report sent tick. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var site = '', textsOn = false;
  var BRAND = { dampscan: 'DampScan', 'ati-london': 'ATi' };
  var cap = function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''; };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };

  function countdown(s) {
    if (!s.reportDeadline) return null;
    var left = Date.parse(s.reportDeadline) - Date.now();
    var mins = Math.round(Math.abs(left) / 60000);
    var text = mins >= 2880 ? Math.floor(mins / 1440) + ' days' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    return U.node('span', 'card-countdown' + (left < 0 ? ' is-over' : left < 4 * 3600000 ? ' is-soon' : ''), left < 0 ? text + ' over' : text + ' left');
  }

  /* The words ChatGPT needs to draft the email through the staff connector. */
  function draftLink(s) {
    var q = 'Using the staff area, draft the final email for ' + (s.name || s.firstName) + (s.postcode ? ' ' + s.postcode : '') +
      ' with their survey report attached, in our playbook style, as a draft in my Outlook. Do not send it.';
    return 'https://chatgpt.com/?q=' + encodeURIComponent(q);
  }

  function row(s) {
    var li = U.node('li', 'jobs-row');
    var top = U.node('div', 'jobs-top');
    /* The name opens the same customer card as Today and Scheduling. */
    var who = U.node('button', 'jobs-who link-btn', [s.name || s.firstName || 'No name', s.postcode].filter(Boolean).join(', '));
    who.type = 'button';
    who.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(s.id, { onChange: load }); });
    top.appendChild(who);
    var cd = countdown(s);
    if (cd) top.appendChild(cd);
    li.appendChild(top);
    li.appendChild(U.node('p', 'jobs-meta', [day(s.date), s.surveyLabel, cap(s.surveyor), BRAND[s.site]].filter(Boolean).join(' · ') + (s.paid ? ' · Paid' : ' · Not paid in full')));
    var foot = U.node('div', 'jobs-foot');
    var status = U.node('span', 'panel-note');
    if (s.reportFile) {
      var a = U.node('a', 'pill', 'Report: ' + s.reportFile);
      a.href = '/api/admin/attachment?report=' + s.id;
      foot.appendChild(a);
    } else {
      var lab = U.node('label', 'btn btn--ghost btn--sm', 'Upload report');
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/pdf,.pdf,.docx'; input.hidden = true;
      input.addEventListener('change', async function () {
        if (!input.files[0]) return;
        status.textContent = 'Uploading…';
        try { await global.DSREPORT.upload(s.id, input.files[0]); load(); } catch (e) { status.textContent = e.message; }
      });
      lab.appendChild(input);
      foot.appendChild(lab);
    }
    if (s.reportFile) {
      var first = s.firstName || 'them';
      var ready = U.node('button', 'btn btn--sm' + (s.reportReady ? ' is-on' : ''), s.reportReady ? 'Ready ✓' : 'Report ready (texts ' + first + ' in 2 min)');
      ready.type = 'button';
      ready.setAttribute('aria-pressed', String(s.reportReady));
      ready.addEventListener('click', function () { report(s, { ready: !s.reportReady }, ready, status, s.reportReady ? 'Not ready.' : (s.reportHeld ? 'Ready, on hold: nothing sent.' : 'Ready. ' + first + ' gets a text in 2 minutes.')); });
      foot.appendChild(ready);
      var hold = U.node('button', 'btn btn--ghost btn--sm' + (s.reportHeld ? ' is-on' : ''), s.reportHeld ? 'On hold: let go' : 'Hold');
      hold.type = 'button';
      hold.setAttribute('aria-pressed', String(s.reportHeld));
      hold.addEventListener('click', function () { report(s, { hold: !s.reportHeld }, hold, status, s.reportHeld ? 'Let go.' : 'On hold: locked on their page, no texts.'); });
      foot.appendChild(hold);
    }
    var draft = U.node('a', 'btn btn--ghost btn--sm', 'Draft email in ChatGPT');
    draft.href = draftLink(s); draft.target = '_blank'; draft.rel = 'noopener';
    foot.appendChild(draft);
    /* Report sent texts them too (the report text), unless Report ready already did. */
    var sent = U.node('button', 'btn btn--primary btn--sm', 'Report sent' + (textsOn && !s.reportReady ? ' (texts ' + (s.firstName || 'them') + ' in 2 min)' : ''));
    sent.type = 'button';
    sent.addEventListener('click', async function () {
      sent.disabled = true;
      try { await U.send('/api/admin/clients', { id: s.id, surveySent: true }); load(); } catch (e) { sent.disabled = false; status.textContent = 'Could not tick it. Try again.'; }
    });
    foot.appendChild(sent);
    foot.appendChild(status);
    li.appendChild(foot);
    return li;
  }

  async function report(s, change, btn, status, said) {
    btn.disabled = true;
    var r;
    try { r = await U.send('/api/admin/surveys', Object.assign({ op: 'report', id: s.id }, change)); } catch (e) { r = { ok: false }; }
    if (!r.ok) { btn.disabled = false; status.textContent = 'Not saved (managers only). Try again.'; return; }
    status.textContent = said;
    load();
  }

  async function load() {
    try {
      var data = await U.get('/api/admin/surveys?view=reports' + (site ? '&site=' + site : ''));
      textsOn = Boolean(data.textsOn);
      var list = el('list');
      list.textContent = '';
      data.surveys.forEach(function (s) { list.appendChild(row(s)); });
      el('state').textContent = data.surveys.length ? '' : 'Every report is sent. Nice.';
      el('state').hidden = data.surveys.length > 0;
      list.hidden = !data.surveys.length;
    } catch (e) {
      if (e.message !== 'unauthorised') el('state').textContent = 'Could not load the reports.';
    }
  }

  document.querySelectorAll('[data-site]').forEach(function (p) {
    p.addEventListener('click', function () {
      site = p.dataset.site;
      document.querySelectorAll('[data-site]').forEach(function (q) { q.setAttribute('aria-pressed', String(q === p)); });
      load();
    });
  });
  if (U.scopePills) U.scopePills('[data-site]');
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  setInterval(load, 300000);
  load();
})(window);
