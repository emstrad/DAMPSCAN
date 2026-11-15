/* The home page booking trial (the owner's brief, 15 Nov 2026), on an exact copy
   of the home page (scripts/trial-home.js). Step 1 in the usual card, kept
   compact: name, mobile, email, the full address and who lets us in. Then the
   card grows across the hero for step 2, what they are dealing with and their
   survey (home-trial-need.js), step 3, a real free time from the Lab's route,
   booked on the tap, then done (home-trial-done.js), with anything to add after.
   Nothing is saved or sent: the end shows what the live form would have done. Owners only; anyone else goes to the staff sign-in. */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var STEPS = 4, NAMES = ['Details', 'Survey', 'Time', 'Done'];
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

  /* A small Call us chip on every step, to the number in the site's own header. */
  var telA = document.querySelector('a[href^="tel:"]'), TEL = telA ? telA.getAttribute('href') : '';
  function callChip() {
    var a = el('a', 'ht-call'); a.href = TEL;
    a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z"/></svg>';
    a.appendChild(el('span', null, 'Call us')); a.setAttribute('aria-label', 'Call us'); return a;
  }
  if (TEL) card.querySelector('.fnav').appendChild(callChip());

  /* ---------- Step 1, in the card ---------- */
  var phoneOk = function (v) { var n = String(v || '').replace(/[\s()-]/g, '').replace(/^\+44/, '0'); return /^0\d{10}$/.test(n); };
  var pcOk = function (v) { return /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(String(v || '').trim()); };
  ['f-phone', 'f-agent-phone'].forEach(function (id) { var i = $(id); i.addEventListener('input', function () { var v = i.value.replace(/[^\d\s+]/g, ''); i.value = v.charAt(0) + v.slice(1).replace(/\+/g, ''); }); });
  document.querySelectorAll('input[name="Access"]').forEach(function (r) { r.addEventListener('change', function () { $('f-agent-fields').hidden = !$('f-agent-on').checked; }); });
  /* The postcode tidied as they leave the box (me196ab becomes ME19 6AB), checked
     against postcodes.io, and a soft word when it is outside London and Kent. */
  var tidyPc = function (v) { var t = String(v || '').toUpperCase().replace(/\s+/g, ''); return t.length > 4 ? t.slice(0, -3) + ' ' + t.slice(-3) : t; };
  var LONDON = ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC', 'BR', 'CR', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB'], KENT = ['ME', 'TN', 'CT'];
  function ours(pc) { var m = /^([A-Z]{1,2})(\d{1,2})/.exec(pc.replace(/\s+/g, '')); if (!m) return true; return m[1] === 'DA' || LONDON.indexOf(m[1]) !== -1 || KENT.indexOf(m[1]) !== -1; }
  var pcIn = $('f-postcode'), pcRow = pcIn.closest('.form-row'), pcErr = pcRow.querySelector('.err'), pcNote = el('p', 'ht-pc-note'), pcBad = null;
  pcNote.hidden = true; pcRow.appendChild(pcNote);
  pcIn.addEventListener('blur', function () {
    /* The note changes only once the answer is back, so Continue never moves under a finger mid-tap. */
    var v = tidyPc(pcIn.value); if (!v) return; pcIn.value = v;
    if (!pcOk(v)) { pcNote.hidden = true; return; }
    fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(v.replace(' ', ''))).then(function (r) {
      if (r.status === 404) { pcBad = v; pcErr.textContent = 'We can\'t find that postcode. Please check it.'; mark(pcIn, true); return; }
      if (!r.ok) return;
      pcBad = null; pcErr.textContent = 'Please enter the postcode.'; mark(pcIn, false);
      pcNote.hidden = ours(v);
      if (!ours(v)) { pcNote.textContent = 'That\'s outside London and Kent, where we usually work. Carry on and we\'ll confirm we can reach you.'; }
    }).catch(function () {});
  });
  function mark(input, bad, row) { input.setAttribute('aria-invalid', String(bad)); (row || input.closest('.form-row')).classList.toggle('has-err', bad); return bad; }
  function checkOne() {
    var bad = false;
    bad = mark($('f-name'), !$('f-name').value.trim()) || bad;
    bad = mark($('f-phone'), !phoneOk($('f-phone').value)) || bad;
    bad = mark($('f-email'), !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($('f-email').value.trim())) || bad;
    bad = mark($('f-postcode'), !pcOk($('f-postcode').value) || pcBad === tidyPc($('f-postcode').value)) || bad;
    bad = mark($('f-addr1'), !$('f-addr1').value.trim()) || bad;
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
    d.postcode = tidyPc($('f-postcode').value);
    /* Outside London and Kent: no times to offer, so the time step is skipped and we confirm by phone. */
    d.outside = !ours(d.postcode);
    d.agent = $('f-agent-on').checked ? { name: $('f-agent').value.trim(), phone: $('f-agent-phone').value.trim() } : null;
    open();
  });

  /* The card grows across the hero, from where it sits to the hero's whole width,
     then settles into the page so the hero simply grows with what it holds. */
  var hero = card.closest('.hero-grid') || card.parentNode;
  function box(r) { var c = hero.getBoundingClientRect(); return { top: r.top - c.top, left: r.left - c.left, width: r.width, height: r.height }; }
  function place(b) { stage.style.top = b.top + 'px'; stage.style.left = b.left + 'px'; stage.style.width = b.width + 'px'; stage.style.height = b.height + 'px'; }
  function full() {
    var cs = getComputedStyle(hero), c = hero.getBoundingClientRect();
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    return { top: pt, left: pl, width: c.width - pl - pr, height: Math.max(c.height - pt - pb, card.offsetHeight) };
  }
  var MS = reduce ? 0 : 480;
  function open() {
    stage = el('div', card.className.replace(/\bis-open\b/, '') + ' ht-stage'); stage.removeAttribute('id');
    stage.setAttribute('role', 'region'); stage.setAttribute('aria-label', 'Book your survey');
    var inner = el('div', 'ht-inner'), top = el('div', 'ht-top');
    var back = el('button', 'back-link ht-back', '\u2190 Back'); back.type = 'button'; back.addEventListener('click', function () { if (step <= 2) close(); else go(step === 4 && (d.agent || d.outside) ? 2 : step - 1); });
    var dots = el('div', 'dots'); dots.id = 'ht-dots';
    top.appendChild(back); top.appendChild(dots); if (TEL) top.appendChild(callChip()); inner.appendChild(top);
    body = el('div', 'ht-body'); inner.appendChild(body); stage.appendChild(inner);
    place(box(card.getBoundingClientRect()));
    hero.appendChild(stage); document.body.classList.add('ht-booking');
    card.style.visibility = 'hidden';
    void stage.offsetWidth;
    stage.classList.add('is-moving'); place(full());
    setTimeout(function () {
      if (!stage) return;
      /* Settled: in the page's flow, the hero's copy set aside, the height its content's. */
      hero.classList.add('ht-open'); stage.classList.remove('is-moving'); stage.removeAttribute('style'); stage.classList.add('is-shown');
      var y = hero.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }, MS);
    if (!prices) fetch('/api/admin/hours?view=slots', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (x) { if (!x.prices) throw new Error(); prices = x.prices; if (step === 2) go(2); })
      .catch(function () { if (step === 2 && body) { body.textContent = ''; body.appendChild(el('p', 'ht-sub', 'Prices could not load: are you signed in as an owner?')); } });
    go(2);
  }
  function close() {
    var s = stage; if (!s) return;
    var from = box(s.getBoundingClientRect());
    s.classList.remove('is-shown'); hero.classList.remove('ht-open');
    place(from); void s.offsetWidth;
    s.classList.add('is-moving'); place(box(card.getBoundingClientRect()));
    stage = null; step = 1; dotsTo(1); document.body.classList.remove('ht-booking');
    setTimeout(function () { s.remove(); card.style.visibility = ''; }, MS);
  }
  function dotsTo(n) {
    [$('dots'), $('ht-dots')].forEach(function (box) {
      if (!box) return;
      box.textContent = '';
      for (var i = 1; i <= STEPS; i += 1) box.appendChild(el('span', i <= n ? 'is-done' : null));
      box.appendChild(el('span', 'step-label', 'Step ' + n + ' of ' + STEPS + ' \u00b7 ' + NAMES[n - 1]));
    });
  }
  function go(n) {
    step = n; dotsTo(n); body.textContent = '';
    var pane = el('div', n === 2 ? 'ht-pane ht-pane--need' : 'ht-pane ht-pane--c'); body.appendChild(pane);
    if (n === 2) { if (prices) global.HTNEED.draw(pane, d, prices, function () { go(d.agent || d.outside ? 4 : 3); }); else pane.appendChild(el('p', 'ht-sub', 'Loading...')); }
    if (n === 3) when(pane);
    if (n === 4) global.HTDONE.draw(pane, d, { money: money, nice: nice, clock: clock, sizes: prices.sizes, again: again });
    /* A new step starts at its top, under the site's header. */
    if (stage && stage.classList.contains('is-shown')) { var y = stage.getBoundingClientRect().top + window.scrollY - 90; if (window.scrollY > y) window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); }
  }

  /* ---------- Step 3: a real free time for their postcode and survey length ---------- */
  function when(pane) {
    pane.appendChild(el('h2', 'ht-h', 'When suits you?'));
    var quick = el('div', 'ht-quick'), nav = el('div', 'ht-week'), days = el('div', 'ht-days'), times = el('div', 'ht-times');
    pane.appendChild(quick); pane.appendChild(nav); pane.appendChild(days); pane.appendChild(times);
    var minutes = (d.pick && d.pick.minutes) || 60;
    /* Tapping a time books it there and then (the live form with Book it straight away on). */
    var book = function (dd, t) { d.when = { date: dd, time: t }; go(4); };
    fetch('/api/admin/hours?view=slots&days=56&postcode=' + encodeURIComponent(d.postcode) + '&minutes=' + minutes, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); }).then(function (x) {
        var by = {}; (x.slots || []).forEach(function (s) { (by[s.date] = by[s.date] || []).push(s); });
        var free = Object.keys(by).sort();
        if (!free.length) {
          /* Nothing free near them: leave it with us rather than a dead end. */
          quick.appendChild(el('p', 'ht-sub', 'We\'ll find a time that works and call you to arrange it.'));
          var leave = el('button', 'btn btn--primary btn--lg', 'Leave it with us'); leave.type = 'button'; leave.addEventListener('click', function () { d.when = null; go(4); });
          quick.appendChild(leave); skip.hidden = anytime.hidden = times.hidden = true; return;
        }
        var e = by[free[0]][0], eb = el('button', 'ht-earliest'); eb.type = 'button';
        eb.appendChild(el('span', null, 'Earliest')); eb.appendChild(el('b', null, short(free[0]) + ', ' + clock(e.time)));
        eb.addEventListener('click', function () { book(free[0], e.time); }); quick.appendChild(eb);
        /* A week at a time, Monday first, opening on the first week with a free time. */
        var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
        var monday = function (dd) { var t = Date.parse(dd + 'T12:00:00Z'); return t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5; };
        var first = monday(free[0]), last = monday(free[free.length - 1]), week = first;
        var prev = el('button', 'bt-time ht-arrow', '\u2039'), next = el('button', 'bt-time ht-arrow', '\u203a'), label = el('b', 'ht-week-label');
        prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Earlier week'); next.setAttribute('aria-label', 'Later week');
        nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next);
        function show(dd) {
          days.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z.dataset.day === dd)); });
          times.textContent = ''; times.appendChild(el('p', 'ht-day', nice(dd)));
          [['Morning', function (t) { return t < '12:00'; }], ['Afternoon', function (t) { return t >= '12:00'; }]].forEach(function (g) {
            var list = by[dd].filter(function (s) { return g[1](s.time); }); if (!list.length) return;
            var grp = el('div', 'ht-tgroup'); grp.appendChild(el('span', 'ht-tlabel', g[0]));
            var row = el('div', 'bt-row');
            list.forEach(function (s) { var t = el('button', 'bt-time', clock(s.time)); t.type = 'button'; t.addEventListener('click', function () { book(dd, s.time); }); row.appendChild(t); });
            grp.appendChild(row); times.appendChild(grp);
          });
        }
        function draw() {
          days.textContent = ''; var pick = null;
          label.textContent = short(iso(week)).replace(/^\w+,? /, '') + ' to ' + short(iso(week + 6 * 864e5)).replace(/^\w+,? /, '');
          prev.disabled = week <= first; next.disabled = week >= last;
          for (var i = 0; i < 7; i += 1) {
            var dd = iso(week + i * 864e5), b = el('button', 'bt-time ht-dayb'); b.type = 'button'; b.dataset.day = dd;
            var p = short(dd).replace(',', '').split(' '); b.appendChild(el('span', null, p[0])); b.appendChild(el('b', null, p[1]));
            if (!by[dd]) b.disabled = true; else { if (!pick) pick = dd; b.addEventListener('click', show.bind(null, dd)); }
            days.appendChild(b);
          }
          if (pick) show(pick); else { times.textContent = ''; times.appendChild(el('p', 'ht-sub', 'Nothing free this week.')); }
        }
        prev.addEventListener('click', function () { week -= 7 * 864e5; draw(); });
        next.addEventListener('click', function () { week += 7 * 864e5; draw(); });
        draw();
      }).catch(function () { days.appendChild(el('p', 'ht-sub', 'Times could not load.')); });
    var anytime = el('p', 'ht-sub ht-small', 'Change your time anytime from your page.'); pane.appendChild(anytime);
    var skip = el('button', 'bt-skip', 'Skip, just call me'); skip.type = 'button'; skip.addEventListener('click', function () { d.when = null; go(4); });
    pane.appendChild(skip);
  }

  function again() { d.issues = []; d.where = []; d.why = d.scope = d.beds = ''; d.pick = d.when = null; d.previous = false; d.notes = ''; d.files = []; close(); }

  global.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stage) close(); });
})(window);
