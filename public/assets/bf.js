/* The damp sites' booking form (the owner's brief, 15 Nov 2026), on every page
   that carries it (scripts/book-form.js). Step 1 in the usual card, compact:
   name, mobile, email, the full address and who lets us in. Then the card grows
   across the hero for step 2, what they are dealing with and their survey
   (bf-need.js), step 3, a real free time, booked on the tap, then done
   (bf-done.js), with anything to add after. Live it talks to /api/lead
   (bf-live.js); on the staff trial copy (data-mode="trial") nothing is sent. */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var STEPS = 4, NAMES = ['Details', 'Survey', 'Time', 'Done'];
  var d = { issues: [], where: [], why: '', scope: '', beds: '', agent: null, pick: null, when: null, previous: false, notes: '', files: [] };
  var prices = null, stage = null, body = null, step = 1, backBtn = null;
  var card = $('book');
  var me = document.currentScript || {}, mode = (me.dataset && me.dataset.mode) || 'live';
  var api = global.BFAPI[mode === 'trial' ? 'trial' : 'live'];
  if (!card || !$('ht-next')) return;
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var money = function (p) { var n = Number(p); return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  var nice = function (iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var short = function (iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  /* SCOTT or scott reads Scott (the owner, 26 Nov 2026); a name typed with its own capitals is kept. */
  var nameCase = function (v) { return v === v.toUpperCase() || v === v.toLowerCase() ? v.toLowerCase().replace(/(^|[\s'-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : v; };
  var clock = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };

  api.init(d, card);

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
  /* A landline still books; a soft word says a mobile gets their survey page by text. */
  var telIn = $('f-phone'), telNote = el('p', 'ht-pc-note'); telNote.hidden = true; telIn.closest('.form-row').appendChild(telNote);
  telIn.addEventListener('blur', function () { var n = telIn.value.replace(/[\s()-]/g, '').replace(/^\+44/, '0'); telNote.hidden = !phoneOk(n) || /^07/.test(n); telNote.textContent = 'A mobile is best: we text you a link to your survey page.'; });
  document.querySelectorAll('input[name="Access"]').forEach(function (r) { r.addEventListener('change', function () { $('f-agent-fields').hidden = !$('f-agent-on').checked; }); });
  /* The postcode tidied as they leave the box (me196ab becomes ME19 6AB), checked
     against postcodes.io, and a soft word when it is outside the South East
     (the owner, 16 Nov 2026: "anywhere in the southeast is okay for us"). */
  var tidyPc = function (v) { var t = String(v || '').toUpperCase().replace(/\s+/g, ''); return t.length > 4 ? t.slice(0, -3) + ' ' + t.slice(-3) : t; };
  /* London, Kent, Essex, Herts, Beds, Bucks, Berks, Oxon, Surrey, Sussex and Hampshire by postcode area. */
  var SOUTH_EAST = ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC', 'BR', 'CR', 'DA', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB', 'WD',
    'ME', 'TN', 'CT', 'CM', 'CO', 'SS', 'AL', 'SG', 'HP', 'LU', 'MK', 'SL', 'RG', 'OX', 'GU', 'RH', 'BN', 'PO', 'SO', 'SP'];
  function ours(pc) { var m = /^([A-Z]{1,2})(\d{1,2})/.exec(pc.replace(/\s+/g, '')); if (!m) return true; return SOUTH_EAST.indexOf(m[1]) !== -1; }
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
      if (!ours(v)) { pcNote.textContent = 'That\'s outside the South East, where we usually work. Carry on and we\'ll confirm we can reach you.'; }
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
    d.name = nameCase($('f-name').value.trim()); d.phone = $('f-phone').value.trim(); d.email = $('f-email').value.trim();
    d.postcode = tidyPc($('f-postcode').value); d.street = $('f-addr1').value.trim(); d.town = $('f-town').value.trim();
    d.address = [d.street, d.town, d.postcode].filter(Boolean).join(', ');
    d.honeypot = $('f-hp') ? $('f-hp').value : '';
    /* Outside the South East: no times to offer, so the time step is skipped and we confirm by phone. */
    d.outside = !ours(d.postcode);
    d.agent = $('f-agent-on').checked ? { name: $('f-agent').value.trim(), phone: $('f-agent-phone').value.trim() } : null;
    api.step1(d);
    open(2);
  });

  /* The card grows across the hero, from where it sits to the hero's whole width,
     then settles into the page so the hero simply grows with what it holds. */
  var hero = card.closest('.hero-grid') || card.parentNode;
  if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
  function box(r) { var c = hero.getBoundingClientRect(); return { top: r.top - c.top, left: r.left - c.left, width: r.width, height: r.height }; }
  function place(b) { stage.style.top = b.top + 'px'; stage.style.left = b.left + 'px'; stage.style.width = b.width + 'px'; stage.style.height = b.height + 'px'; }
  function full() {
    var cs = getComputedStyle(hero), c = hero.getBoundingClientRect();
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    return { top: pt, left: pl, width: c.width - pl - pr, height: Math.max(c.height - pt - pb, card.offsetHeight) };
  }
  var MS = reduce ? 0 : 480;
  function open(first) {
    /* The keyboard closes before the card grows, so the page is not still moving under it. */
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    /* Up to the form's top first, so it grows in view rather than below them. */
    var y0 = hero.getBoundingClientRect().top + window.scrollY - 90; if (window.scrollY > y0) window.scrollTo(0, y0);
    stage = el('div', card.className.replace(/\bis-open\b/, '') + ' ht-stage'); stage.removeAttribute('id');
    stage.setAttribute('role', 'region'); stage.setAttribute('aria-label', 'Book your survey');
    var inner = el('div', 'ht-inner'), top = el('div', 'ht-top');
    var back = el('button', 'back-link ht-back', '\u2190 Back'); back.type = 'button'; backBtn = back; back.addEventListener('click', function () { if (global.history.state && global.history.state.bf) global.history.back(); else if (step <= 2) close(); else go(step === 4 && (d.agent || d.outside) ? 2 : step - 1); });
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
      toTop();
    }, MS);
    if (!prices) api.prices().then(function (x) { prices = x; if (stage) go(step, true); })
      .catch(function () { if (body) { body.textContent = ''; body.appendChild(el('p', 'ht-sub', 'That didn\'t load. Please try again, or call us.')); } });
    go(first || 2);
  }
  function close() {
    var s = stage; if (!s) return;
    var from = box(s.getBoundingClientRect());
    s.classList.remove('is-shown'); hero.classList.remove('ht-open');
    place(from); void s.offsetWidth;
    s.classList.add('is-moving'); place(box(card.getBoundingClientRect()));
    stage = null; step = 1; dotsTo(1); document.body.classList.remove('ht-booking'); keep();
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
  /* Each step is a page in the browser's history, so the phone's back gesture steps back
     through the form, and the answers are kept for the tab, so a refresh comes back here. */
  var KEY = 'bf-state';
  function keep() { try { var c = {}; Object.keys(d).forEach(function (k) { if (k !== 'fileObjs') c[k] = d[k]; }); sessionStorage.setItem(KEY, JSON.stringify({ step: step, d: c })); } catch (e) {} }
  function go(n, quiet) {
    /* After a refresh the browser already holds this step's entry: reused, never doubled. */
    var here = global.history.state && global.history.state.bf === n;
    if (!quiet && n !== step && !here && global.history.pushState) global.history.pushState({ bf: n }, '');
    else if (!quiet && global.history.replaceState) global.history.replaceState({ bf: n }, '');
    step = n; dotsTo(n); body.textContent = ''; keep();
    if (n > 2 && !prices) { body.appendChild(el('p', 'ht-sub', 'Loading...')); return; }
    /* Live, a booking made is final here: no way back into the steps (their page moves it). */
    if (backBtn) backBtn.hidden = api.live && n === 4;
    var pane = el('div', n === 2 ? 'ht-pane ht-pane--need' : n === 4 ? 'ht-pane ht-pane--c ht-done' : 'ht-pane ht-pane--c'); body.appendChild(pane);
    if (n === 2) { if (prices) global.HTNEED.draw(pane, d, prices, submit); else pane.appendChild(el('p', 'ht-sub', 'Loading...')); }
    if (n === 3) global.HTWHEN.draw(pane, { api: api, d: d, go: go, nice: nice, short: short, clock: clock });
    if (n === 4) global.HTDONE.draw(pane, d, { money: money, nice: nice, clock: clock, sizes: prices.sizes, again: again, live: api.live, extras: api.extras });
    /* A new step starts at its top, under the site's header. */
    if (stage && stage.classList.contains('is-shown')) toTop();
  }
  /* At once, not smoothly, and again once a phone's keyboard has gone (the owner, 21 Nov 2026:
     on an iPhone step 2 opened halfway down, the smooth scroll cut short as the keyboard closed). */
  function toTop() {
    var jump = function () { if (!stage) return; var y = stage.getBoundingClientRect().top + window.scrollY - 90; if (Math.abs(window.scrollY - y) > 24 && window.scrollY > y) window.scrollTo(0, y); };
    jump(); setTimeout(jump, 350);
  }

  /* The enquiry goes the moment they choose a time (or, for an agent or outside our area, straight to done). */
  var sending = false;
  function submit(btn) {
    if (sending) return; sending = true; var said = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = 'One moment...'; }
    api.submit(d).then(function (r) {
      sending = false;
      /* Not sure of the survey still goes on to the times (the owner, 21 Nov 2026); only an agent's buyer or outside our area skips them. */
      if (r.ok) { go(d.agent || d.outside ? 4 : 3); return; }
      if (btn) { btn.disabled = false; btn.textContent = said; }
      /* Only a detail the first card shows sends them back there, marked; anything else is said here,
         so nobody is sent round in a loop with nothing to fix (17 Nov 2026). */
      var f = { firstName: 'f-name', email: 'f-email', postcode: 'f-postcode', phone: 'f-phone' }, keys = Object.keys(r.errors || {});
      if (keys.length && keys.every(function (k) { return f[k]; })) { close(); keys.forEach(function (k) { mark($(f[k]), true); }); return; }
      var say = keys.length ? r.errors[keys[0]] : 'That didn\'t send. Please try again, or call us.';
      if (btn && btn.parentNode) { var old = btn.parentNode.querySelector('.ht-senderr'); if (old) old.remove(); var p = el('p', 'ht-sub ht-senderr', say); p.setAttribute('role', 'alert'); btn.parentNode.insertBefore(p, btn.nextSibling); }
      else global.alert(say);
    });
  }

  /* Step 3, the times, is bf-when.js. */

  function again() { d.issues = []; d.where = []; d.why = d.scope = d.beds = ''; d.pick = d.when = null; d.previous = false; d.notes = ''; d.files = []; d.fileObjs = []; d.requested = false; d.page = null; d.leadId = null; close(); try { sessionStorage.removeItem(KEY); } catch (e) {} }

  global.addEventListener('popstate', function (e) {
    var to = e.state && e.state.bf;
    if (!stage) return;
    /* A booking made is final here: back stays on Done (their page moves it). */
    if (api.live && step === 4 && d.when && !d.requested) { global.history.pushState({ bf: 4 }, ''); return; }
    if (!to || to < 2) { close(); return; }
    go(to, true);
  });
  /* Back after a refresh: the answers so far, on the step they were on. */
  (function restore() {
    var saved = null; try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!saved || !saved.d || !(saved.step >= 2)) return;
    Object.keys(saved.d).forEach(function (k) { d[k] = saved.d[k]; });
    [['f-name', d.name], ['f-phone', d.phone], ['f-email', d.email], ['f-postcode', d.postcode], ['f-addr1', d.street], ['f-town', d.town]].forEach(function (f) { if ($(f[0]) && f[1]) $(f[0]).value = f[1]; });
    if (d.agent && $('f-agent-on')) { $('f-agent-on').checked = true; $('f-agent-fields').hidden = false; $('f-agent').value = d.agent.name || ''; $('f-agent-phone').value = d.agent.phone || ''; }
    api.step1(d);
    open(saved.step === 3 && !d.leadId ? 2 : saved.step);
  })();

  global.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stage && !(api.live && step === 4)) close(); });
})(window);
