/* The home page booking trial (the owner's brief, 15 Nov 2026), on an exact copy
   of the home page (scripts/trial-home.js). Step 1 in the usual card: name,
   mobile, email, the full address and who lets us in. Then the card opens out to
   fill the screen for step 2, what they are dealing with and what they need
   (home-trial-need.js), step 3, a real free time from the Lab's route, and
   step 4, anything to add. Nothing is saved or sent: the end shows what the live
   form would have done. Owners only; anyone else goes to the staff sign-in. */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var STEPS = 4;
  var d = { issues: [], where: [], why: '', scope: '', beds: '', agent: null, pick: null, when: null, previous: false, notes: '', files: [] };
  var prices = null, stage = null, body = null, step = 1;
  var card = $('book');
  var site = (document.currentScript && document.currentScript.dataset.site) || 'dampscan';
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var money = function (p) { var n = Number(p); return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  var nice = function (iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var short = function (iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var clock = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };

  /* The owners only: the free times come from their route, and signed-out visitors go to sign in. */
  fetch('/api/admin/me', { headers: { Accept: 'application/json' } }).then(function (r) { if (r.status === 401) location.replace('/staff?next=' + encodeURIComponent(location.pathname)); });
  var badge = el('div', 'ht-badge', 'Staff trial: nothing is sent'); document.body.appendChild(badge);

  /* ---------- Step 1, in the card ---------- */
  var phoneOk = function (v) { var n = String(v || '').replace(/[\s()-]/g, '').replace(/^\+44/, '0'); return /^0\d{10}$/.test(n); };
  var pcOk = function (v) { return /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(String(v || '').trim()); };
  ['f-phone', 'f-agent-phone'].forEach(function (id) { var i = $(id); i.addEventListener('input', function () { var v = i.value.replace(/[^\d\s+]/g, ''); i.value = v.charAt(0) + v.slice(1).replace(/\+/g, ''); }); });
  document.querySelectorAll('input[name="Access"]').forEach(function (r) { r.addEventListener('change', function () { $('f-agent-fields').hidden = !$('f-agent-on').checked; }); });
  function mark(input, bad, row) { input.setAttribute('aria-invalid', String(bad)); (row || input.closest('.form-row')).classList.toggle('has-err', bad); return bad; }
  function checkOne() {
    var bad = false;
    bad = mark($('f-name'), !$('f-name').value.trim()) || bad;
    bad = mark($('f-phone'), !phoneOk($('f-phone').value)) || bad;
    bad = mark($('f-email'), !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('f-email').value.trim())) || bad;
    var noAddr = !$('f-addr1').value.trim(), noPc = !pcOk($('f-postcode').value);
    $('f-addr1').setAttribute('aria-invalid', String(noAddr)); $('f-postcode').setAttribute('aria-invalid', String(noPc));
    var errs = $('f-addr1').closest('.form-row').querySelectorAll('.err');
    errs[0].style.display = noAddr ? 'block' : 'none'; errs[1].style.display = noPc ? 'block' : 'none';
    bad = bad || noAddr || noPc;
    if ($('f-agent-on').checked) {
      bad = mark($('f-agent'), !$('f-agent').value.trim()) || bad;
      bad = mark($('f-agent-phone'), !phoneOk($('f-agent-phone').value)) || bad;
    }
    var first = card.querySelector('[aria-invalid="true"]'); if (first) first.focus();
    return !bad;
  }
  $('ht-next').addEventListener('click', function () {
    if (!checkOne()) return;
    d.name = $('f-name').value.trim(); d.phone = $('f-phone').value.trim(); d.email = $('f-email').value.trim();
    d.address = [$('f-addr1').value.trim(), $('f-town').value.trim(), $('f-postcode').value.trim().toUpperCase()].filter(Boolean).join(', ');
    d.postcode = $('f-postcode').value.trim().toUpperCase();
    d.agent = $('f-agent-on').checked ? { name: $('f-agent').value.trim(), phone: $('f-agent-phone').value.trim() } : null;
    open();
  });

  /* ---------- The card opens out to fill the screen ---------- */
  function place(r) { stage.style.top = r.top + 'px'; stage.style.left = r.left + 'px'; stage.style.width = r.width + 'px'; stage.style.height = r.height + 'px'; }
  function open() {
    stage = el('div', card.className + ' ht-stage'); stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true'); stage.setAttribute('aria-label', 'Book your survey');
    var inner = el('div', 'ht-inner'), top = el('div', 'ht-top');
    var back = el('button', 'back-link ht-back', '← Back'); back.type = 'button'; back.addEventListener('click', function () { if (step <= 2) close(); else go(step - 1); });
    var dots = el('div', 'dots'); dots.id = 'ht-dots';
    top.appendChild(back); top.appendChild(dots); inner.appendChild(top);
    body = el('div', 'ht-body'); inner.appendChild(body); stage.appendChild(inner);
    place(card.getBoundingClientRect());
    document.body.appendChild(stage); document.documentElement.classList.add('ht-lock');
    void stage.offsetWidth;
    stage.classList.add('is-open');
    setTimeout(function () { stage.classList.add('is-shown'); }, reduce ? 0 : 260);
    if (!prices) fetch('/api/admin/hours?view=slots', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (x) { if (!x.prices) throw new Error(); prices = x.prices; if (step === 2) go(2); })
      .catch(function () { if (step === 2 && body) { body.textContent = ''; body.appendChild(el('p', 'ht-sub', 'Prices could not load: are you signed in as an owner?')); } });
    go(2);
  }
  function close() {
    stage.classList.remove('is-shown');
    place(card.getBoundingClientRect());
    stage.classList.remove('is-open');
    var s = stage; stage = null;
    setTimeout(function () { s.remove(); document.documentElement.classList.remove('ht-lock'); }, reduce ? 0 : 460);
    step = 1; dotsTo(1);
  }
  function dotsTo(n) {
    [$('dots'), $('ht-dots')].forEach(function (box) {
      if (!box) return;
      box.textContent = '';
      for (var i = 1; i <= STEPS; i += 1) box.appendChild(el('span', i <= n ? 'is-done' : null));
      box.appendChild(el('span', 'step-label', 'Step ' + n + ' of ' + STEPS));
    });
  }
  function go(n) {
    step = n; dotsTo(n); body.textContent = '';
    var pane = el('div', 'ht-pane'); body.appendChild(pane);
    if (n === 2) { if (prices) global.HTNEED.draw(pane, d, prices, function () { go(3); }); else pane.appendChild(el('p', 'ht-sub', 'Loading...')); }
    if (n === 3) when(pane);
    if (n === 4) extras(pane);
    if (n === 5) done(pane);
    body.scrollTop = 0;
  }

  /* ---------- Step 3: a real free time for their postcode and survey length ---------- */
  function when(pane) {
    pane.appendChild(el('h2', 'ht-h', 'When suits you?'));
    if (d.agent) {
      pane.appendChild(el('p', 'ht-sub', 'We\'ll arrange the time with ' + d.agent.name + ' and text you once it\'s confirmed.'));
      var c = el('button', 'btn btn--primary btn--lg', 'Continue'); c.type = 'button'; c.addEventListener('click', function () { d.when = null; go(4); });
      pane.appendChild(c); return;
    }
    pane.appendChild(el('p', 'ht-sub', 'Pick a day, then a time. These are our surveyors\' real free times near ' + d.postcode + '.'));
    var days = el('div', 'bt-row ht-days'), times = el('div', 'ht-times');
    pane.appendChild(days); pane.appendChild(times);
    var minutes = (d.pick && d.pick.minutes) || 60;
    fetch('/api/admin/hours?view=slots&postcode=' + encodeURIComponent(d.postcode) + '&minutes=' + minutes, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); }).then(function (x) {
        var by = {}; (x.slots || []).forEach(function (s) { (by[s.date] = by[s.date] || []).push(s); });
        var list = Object.keys(by).sort().slice(0, 14);
        if (!list.length) { days.appendChild(el('p', 'ht-sub', 'No free times near there yet: the live form would say we\'ll call to arrange one.')); return; }
        list.forEach(function (dd) {
          var b = el('button', 'bt-time', short(dd)); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
          b.addEventListener('click', function () {
            days.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z === b)); });
            times.textContent = ''; times.appendChild(el('p', 'ht-day', nice(dd)));
            var row = el('div', 'bt-row');
            by[dd].forEach(function (s) { var t = el('button', 'bt-time', clock(s.time)); t.type = 'button'; t.addEventListener('click', function () { d.when = { date: dd, time: s.time }; go(4); }); row.appendChild(t); });
            times.appendChild(row);
          });
          days.appendChild(b);
        });
      }).catch(function () { days.appendChild(el('p', 'ht-sub', 'Times could not load.')); });
    var skip = el('button', 'bt-skip', 'Skip, just call me'); skip.type = 'button'; skip.addEventListener('click', function () { d.when = null; go(4); });
    pane.appendChild(skip);
  }

  /* ---------- Step 4: anything to add, all optional (the old last step) ---------- */
  function extras(pane) {
    pane.appendChild(el('h2', 'ht-h', 'Anything to add?'));
    pane.appendChild(el('p', 'ht-sub', 'All optional.'));
    var f = el('div', 'ht-extras');
    var prev = el('label', 'check'); var pc = el('input'); pc.type = 'checkbox'; pc.checked = d.previous; pc.addEventListener('change', function () { d.previous = pc.checked; });
    var tick = el('span', 'box'); tick.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    prev.appendChild(pc); prev.appendChild(tick); prev.appendChild(document.createTextNode('I\'ve had a damp survey on this property before')); f.appendChild(prev);
    var fr = el('div', 'form-row'); fr.appendChild(el('label', null, 'Photos or a previous report'));
    var files = el('input'); files.type = 'file'; files.multiple = true; files.accept = 'image/*,application/pdf';
    var list = el('ul', 'file-list');
    files.addEventListener('change', function () { d.files = Array.prototype.map.call(files.files, function (x) { return x.name; }); list.textContent = ''; d.files.forEach(function (n) { list.appendChild(el('li', null, n)); }); });
    fr.appendChild(files); fr.appendChild(list); f.appendChild(fr);
    var nr = el('div', 'form-row'); nr.appendChild(el('label', null, 'Anything else we should know?'));
    var notes = el('textarea'); notes.rows = 3; notes.placeholder = 'Where the problem is, when it started...'; notes.value = d.notes; notes.addEventListener('input', function () { d.notes = notes.value; });
    nr.appendChild(notes); f.appendChild(nr); pane.appendChild(f);
    var go4 = el('button', 'btn btn--primary btn--lg', 'Book My Survey'); go4.type = 'button'; go4.addEventListener('click', function () { go(5); });
    pane.appendChild(go4);
  }

  /* ---------- The end: what the live form would have done ---------- */
  function done(pane) {
    dotsTo(STEPS);
    var ring = el('div', 'check-ring'); ring.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    pane.appendChild(ring);
    pane.appendChild(el('h2', 'ht-h', d.when ? 'You\'re booked in, ' + d.name : 'Got it, ' + d.name));
    var s = d.pick ? prices.sizes.filter(function (z) { return z.key === d.pick.size; })[0] : null;
    var lines = [
      ['Survey', s ? (d.pick.service === 'timber' ? 'Damp and timber, ' : 'Damp, ') + s.name.toLowerCase() + (d.pick.extras.length ? ' + ' + d.pick.extras.length + ' extra' + (d.pick.extras.length > 1 ? 's' : '') : '') : 'To agree'],
      ['Price', d.pick ? money(d.pick.totalPounds) + ', deposit ' + money(d.pick.totalPounds / 2) : 'To agree'],
      ['When', d.when ? nice(d.when.date) + ' at ' + clock(d.when.time) : d.agent ? 'Arranged with ' + d.agent.name : 'We\'ll call to arrange'],
      ['Where', d.address], ['Let in by', d.agent ? d.agent.name : d.name], ['Seeing', d.issues.join(', ')]
    ];
    var dl = el('dl', 'ht-sum'); lines.forEach(function (l) { dl.appendChild(el('dt', null, l[0])); dl.appendChild(el('dd', null, l[1])); }); pane.appendChild(dl);
    pane.appendChild(el('p', 'ht-sub', 'Trial only: nothing was saved or sent. Live, this ' + (d.when ? 'books the time, tells the surveyor and texts ' + d.name + ' the deposit link.' : 'makes their card on Scheduling and alerts you.')));
    var again = el('button', 'btn btn--primary btn--lg', 'Start again'); again.type = 'button';
    again.addEventListener('click', function () { d.issues = []; d.where = []; d.why = d.scope = d.beds = ''; d.pick = d.when = null; close(); });
    pane.appendChild(again);
  }

  global.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stage) close(); });
  global.addEventListener('resize', function () { if (stage && !stage.classList.contains('is-open')) place(card.getBoundingClientRect()); });
})(window);
