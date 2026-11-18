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

  /* One survey as one tile (the owner's calmer screens, 16 Nov 2026): the name and countdown open
     its customer card; then the one next step as the big button (upload, Report ready, Report sent),
     and everything else as small soft chips beneath. */
  function row(s) {
    var li = U.node('li', 'rs-card');
    var head = U.node('button', 'rs-head'); head.type = 'button';
    var l = U.node('span', 'c-l');
    l.appendChild(U.node('b', null, [s.name || s.firstName || 'No name', s.postcode].filter(Boolean).join(', ')));
    l.appendChild(U.node('small', null, [day(s.date), s.surveyLabel, cap(s.surveyor), BRAND[s.site]].filter(Boolean).join(' · ')));
    head.appendChild(l);
    var r = U.node('span', 'c-r'); var cd = countdown(s); if (cd) r.appendChild(cd); r.appendChild(U.node('span', 'c-chev', '›'));
    head.appendChild(r);
    head.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(s.id, { onChange: load }); });
    li.appendChild(head);
    var tags = U.node('div', 'rs-tags');
    tags.appendChild(U.node('span', 'c-tag ' + (s.paid ? 'is-good' : 'is-warn'), s.paid ? 'Paid' : 'Not paid in full'));
    if (s.reportReady) tags.appendChild(U.node('span', 'c-tag is-good', 'Ready'));
    if (s.reportHeld) tags.appendChild(U.node('span', 'c-tag is-warn', 'On hold'));
    if (s.submittedBy && !s.reportReady) tags.appendChild(U.node('span', 'c-tag is-info', s.submittedBy + ' finished it: check it'));
    li.appendChild(tags);
    var status = U.node('p', 'rs-say', '');
    var first = s.firstName || 'them';
    var chips = U.node('div', 'rs-chips');
    var chip = function (text, fn) { var c = U.node('button', 'rs-chip', text); c.type = 'button'; c.addEventListener('click', fn); return c; };
    var sentBtn = function (cls) {
      var b = U.node('button', cls, 'Report sent' + (textsOn && !s.reportReady ? ' (texts ' + first + ' in 2 min)' : '')); b.type = 'button';
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { await U.send('/api/admin/clients', { id: s.id, surveySent: true }); load(); } catch (e) { b.disabled = false; status.textContent = 'Could not tick it. Try again.'; }
      });
      return b;
    };
    if (!s.reportFile) {
      var lab = U.node('label', 'rs-next', 'Upload report');
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/pdf,.pdf,.docx'; input.hidden = true;
      input.addEventListener('change', async function () {
        if (!input.files[0]) return;
        status.textContent = 'Uploading…';
        try { await global.DSREPORT.upload(s.id, input.files[0]); load(); } catch (e) { status.textContent = e.message; }
      });
      lab.appendChild(input);
      li.appendChild(lab);
    } else if (!s.reportReady) {
      var ready = U.node('button', 'rs-next', 'Report ready (texts ' + first + ' in 2 min)'); ready.type = 'button';
      ready.addEventListener('click', function () { report(s, { ready: true }, ready, status, s.reportHeld ? 'Ready, on hold: nothing sent.' : 'Ready. ' + first + ' gets a text in 2 minutes.'); });
      li.appendChild(ready);
    } else li.appendChild(sentBtn('rs-next'));
    if (s.reportFile) {
      var a = U.node('a', 'rs-chip', 'Open report'); a.href = '/api/admin/attachment?report=' + s.id; chips.appendChild(a);
      if (s.reportReady) chips.appendChild(chip('Not ready', function (ev) { report(s, { ready: false }, ev.currentTarget, status, 'Not ready.'); }));
      /* Sent another way (emailed, handed over): marked sent with no report texts. */
      chips.appendChild(chip('Sent, no text', async function (ev) {
        ev.currentTarget.disabled = true;
        try { await U.send('/api/admin/clients', { id: s.id, surveySent: true, quiet: true }); load(); } catch (e) { ev.currentTarget.disabled = false; status.textContent = 'Could not tick it. Try again.'; }
      }));
      chips.appendChild(chip(s.reportHeld ? 'Let go' : 'Hold', function (ev) { report(s, { hold: !s.reportHeld }, ev.currentTarget, status, s.reportHeld ? 'Let go.' : 'On hold: locked on their page, no texts.'); }));
    }
    var draft = U.node('a', 'rs-chip', 'Draft email'); draft.href = draftLink(s); draft.target = '_blank'; draft.rel = 'noopener'; chips.appendChild(draft);
    if (!s.reportReady && s.reportFile) chips.appendChild(sentBtn('rs-chip'));
    li.appendChild(chips);
    li.appendChild(status);
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
