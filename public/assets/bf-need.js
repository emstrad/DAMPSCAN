/* The booking form's step 2 (bf.js): one question, how big is the home, with a
   damp survey of a full house already chosen and the button live from the start
   (the owner, 21 Nov 2026: seven in twelve left the four-part screen). Timber is
   one switch; extra checks and what they are seeing fold away as optional. Built
   once and changed in place, so a tap never moves the page: a Recommended tag
   sits on the box's edge and an (i) opens a floating note, a sheet from the
   bottom on a phone. Add-ons are never ticked for them; nothing step 1 asked is
   asked again. Prices from the one list; no total beside the button. */
(function (global) {
  'use strict';
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var svg = function (paths) { return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; };
  var TICK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var ISSUES = [
    ['Damp', 'Tide marks, peeling paint', svg('<path d="M12 3c3.5 4.4 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.6 6-11z"/>')],
    ['Mould', 'Black spots, a musty smell', svg('<circle cx="8" cy="9" r="2.2"/><circle cx="15.5" cy="7.5" r="1.6"/><circle cx="14" cy="15" r="2.6"/><circle cx="7.5" cy="16.5" r="1.3"/>')],
    ['Timber / Woodworm', 'Holes, soft wood, bouncy floors', svg('<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="8" cy="12" r=".9"/><circle cx="12.5" cy="10.5" r=".9"/><circle cx="15.5" cy="13.5" r=".9"/>')],
    ['Leak / Water damage', 'Stains after rain, a marked ceiling', svg('<path d="M4 10h16"/><path d="M7 10V6h10v4"/><path d="M9 14v2M12 15v3M15 14v2"/>')],
    ['Cold / condensation', 'Wet windows, cold walls', svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8v3M13 7v5M16 9v2"/>')],
    ['Not sure', 'Something is not right', svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>')]
  ];
  var has = function (d, k) { return d.issues.indexOf(k) !== -1; };
  var pounds = function (n, from) { return (from ? 'from ' : '') + '£' + n; };

  /* What fits what they ticked: nothing until they tick something, and only an
     add-on the tick really points to (damp alone says nothing about a cavity
     wall, so the cavity check is never suggested here). */
  function recommended(d) {
    var r = { service: null, size: d.agent ? 'full-house' : null, extras: {}, why: {} };
    if (d.agent) r.why.size = 'You are buying, so the whole home is worth seeing.';
    if (!d.issues.length) return r;
    r.service = has(d, 'Timber / Woodworm') ? 'timber' : 'damp';
    r.why.service = r.service === 'timber' ? 'You ticked timber or woodworm.' : 'Every survey starts with damp.';
    if (has(d, 'Leak / Water damage') || d.agent) r.extras.drone = d.agent ? 'You are buying and cannot see the roof up close.' : 'A leak often starts on the roof, chimney or gutters.';
    if (has(d, 'Timber / Woodworm')) r.extras.camera = 'Woodworm and rot often start under suspended floors.';
    return r;
  }

  /* One floating note for every (i): beside the button, or a sheet on a phone. */
  var pop = null, popFor = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
  function openPop(btn, title, text, why) {
    if (popFor === btn) return closePop();
    closePop();
    pop = el('div', 'ht-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', title);
    pop.appendChild(el('b', null, title)); pop.appendChild(el('p', null, text));
    if (why) { var w = el('p', 'ht-pop-why'); w.appendChild(el('span', 'ht-rec', 'Recommended')); w.appendChild(document.createTextNode(' ' + why)); pop.appendChild(w); }
    if (btn.closest('.is-brand')) pop.classList.add('is-brand');
    popY = global.scrollY;
    document.body.appendChild(pop); popFor = btn; btn.setAttribute('aria-expanded', 'true');
    if (global.innerWidth > 600) {
      var r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.max(12, Math.min(r.right - pw, global.innerWidth - pw - 12));
      var top = r.bottom + 8 + ph > global.innerHeight ? r.top - ph - 8 : r.bottom + 8;
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
    } else pop.classList.add('is-sheet');
  }
  document.addEventListener('click', function (e) { if (pop && !pop.contains(e.target) && e.target !== popFor) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  /* A floating note follows nothing, so a real scroll closes it (a nudge does not). */
  var popY = 0;
  global.addEventListener('scroll', function () { if (pop && !pop.classList.contains('is-sheet') && Math.abs(global.scrollY - popY) > 40) closePop(); }, { passive: true });

  function infoBtn(title, text, why) {
    var i = el('button', 'bt-info', 'i'); i.type = 'button'; i.setAttribute('aria-label', 'What is ' + title + '?'); i.setAttribute('aria-expanded', 'false');
    i.addEventListener('click', function (e) { e.stopPropagation(); openPop(i, title, text, why()); });
    return i;
  }
  /* d: the answers so far; P: the price list; done(): on to the times.
     One question, the button live from the start (the owner, 21 Nov 2026: seven in
     twelve left the four-part screen). A damp survey of a full house is already
     chosen and changes with one tap; timber is a switch; the extras and what they
     are seeing fold away as optional; no price beside the button. */
  function draw(box, d, P, done) {
    box.textContent = ''; closePop();
    if (!d.pick) d.pick = { service: 'damp', size: 'full-house', extras: [] };
    var pick = d.pick, rec = recommended(d), parts = [];
    if (!pick.service) pick.service = 'damp';
    if (!pick.size) pick.size = 'full-house';
    var main = el('div', 'ht-need-one');
    box.appendChild(main);
    function option(row, b, recKey) {
      var t = el('span', 'ht-rec ht-rec--edge', 'Recommended'); t.hidden = true; b.appendChild(t);
      parts.push({ b: b, tag: t, recKey: recKey }); row.appendChild(b);
    }

    main.appendChild(el('h2', 'ht-h ht-one-h', 'How big is the home?'));
    var sizes = el('div', 'ht-opts ht-opts--4');
    P.sizes.forEach(function (z) {
      var row = el('div', 'bt-pick ht-opt'), b = el('button', 'bt-survey'); b.type = 'button'; b.dataset.size = z.key;
      b.appendChild(el('b', null, z.name)); b.appendChild(el('span', 'ht-opt-say', z.scope));
      b.addEventListener('click', function () { pick.size = z.key; sync(); });
      /* The scope under each name says it; no (i) here, so four boxes fit a phone two by two. */
      option(row, b, 'size:' + z.key); sizes.appendChild(row);
    });
    main.appendChild(sizes);

    /* Damp is always the survey; timber is one switch on top of it. */
    var trow = el('div', 'bt-pick ht-opt ht-switch-row'), tb = el('button', 'bt-survey ht-add ht-switch'); tb.type = 'button';
    var tbox = el('span', 'ht-box'), ttop = el('span', 'ht-opt-top'); ttop.appendChild(tbox); ttop.appendChild(el('b', null, 'Check timber and woodworm too'));
    tb.appendChild(ttop);
    tb.addEventListener('click', function () { pick.service = pick.service === 'timber' ? 'damp' : 'timber'; sync(); });
    option(trow, tb, 'service:timber');
    trow.appendChild(infoBtn(P.services.timber.name, P.services.timber.info, function () { return rec.service === 'timber' ? rec.why.service : ''; }));
    main.appendChild(trow);

    /* Optional, folded: extra checks, then what they are seeing (which only shapes what we suggest). */
    var fx = el('details', 'ht-fold'); fx.appendChild(el('summary', null, 'Add extra checks (optional)'));
    var adds = el('div', 'ht-opts ht-opts--adds'), ticks = {};
    P.extras.filter(function (x) { return x.addable; }).forEach(function (x) {
      var row = el('div', 'bt-pick ht-opt'), b = el('button', 'bt-survey ht-add'); b.type = 'button'; b.dataset.extra = x.key;
      ticks[x.key] = el('span', 'ht-box');
      var top = el('span', 'ht-opt-top'); top.appendChild(ticks[x.key]); top.appendChild(el('b', null, x.name)); top.appendChild(el('span', 'bt-price', '+' + pounds(x.withSurvey, x.from)));
      b.appendChild(top);
      b.addEventListener('click', function () { var i = pick.extras.indexOf(x.key); if (i === -1) pick.extras.push(x.key); else pick.extras.splice(i, 1); sync(); });
      option(row, b, 'extra:' + x.key);
      row.appendChild(infoBtn(x.name, x.scope + '. ' + x.info, function () { return rec.extras[x.key] || ''; })); adds.appendChild(row);
    });
    fx.appendChild(adds); main.appendChild(fx);
    var fi = el('details', 'ht-fold'); fi.appendChild(el('summary', null, 'What are you seeing? (optional)'));
    var tiles = el('div', 'ht-tiles');
    ISSUES.forEach(function (it) {
      var t = el('button', 'ht-tile'); t.type = 'button'; t.dataset.issue = it[0];
      t.innerHTML = '<span class="ht-tile-ico">' + it[2] + '</span>';
      t.appendChild(el('b', null, it[0])); t.appendChild(el('span', 'ht-tile-say', it[1]));
      t.addEventListener('click', function () { var i = d.issues.indexOf(it[0]); if (i === -1) d.issues.push(it[0]); else d.issues.splice(i, 1); sync(); });
      tiles.appendChild(t);
    });
    fi.appendChild(tiles); main.appendChild(fi);
    if (d.issues.length) fi.open = true;
    if (pick.extras.length) fx.open = true;

    /* Your real rules: people book more when they can see them. */
    var promise = el('ul', 'ht-promise');
    ['50% deposit, the rest after the visit', 'Change your time free from your page', 'Full refund up to 48 hours before'].forEach(function (t) { var li = el('li'); li.innerHTML = TICK; li.appendChild(document.createTextNode(t)); promise.appendChild(li); });
    box.appendChild(promise);
    var bar = el('div', 'ht-total ht-total--go'), go = el('button', 'btn btn--primary btn--lg'); go.type = 'button';
    go.textContent = d.agent || d.outside ? 'Send my details' : 'Choose a time';
    bar.appendChild(go); box.appendChild(bar);
    go.addEventListener('click', function () { done(go); });
    /* The way out for anyone unsure: nothing picked, and on to the end, where we call to help them choose. */
    var skip = el('p', 'ht-skip'), skipBtn = el('button', 'btn btn--ghost', 'Not sure? We\'ll call you'); skipBtn.type = 'button';
    skip.appendChild(skipBtn); box.appendChild(skip);
    skipBtn.addEventListener('click', function () {
      if (!has(d, 'Not sure')) d.issues.push('Not sure');
      pick.service = null; pick.size = null; pick.extras = []; d.unsure = true; pick.totalPounds = null; pick.minutes = null;
      done(skipBtn);
    });

    function sync() {
      rec = recommended(d);
      tiles.querySelectorAll('.ht-tile').forEach(function (t) { t.setAttribute('aria-pressed', String(has(d, t.dataset.issue))); });
      parts.forEach(function (p) {
        var k = p.recKey.split(':'), on = false, show = false;
        if (k[0] === 'service') { on = pick.service === k[1]; show = rec.service === k[1]; tbox.innerHTML = on ? TICK : ''; }
        if (k[0] === 'size') { on = pick.size === k[1]; show = rec.size === k[1] && pick.size !== k[1]; }
        if (k[0] === 'extra') { on = pick.extras.indexOf(k[1]) !== -1; show = Boolean(rec.extras[k[1]]); ticks[k[1]].innerHTML = on ? TICK : ''; }
        p.b.setAttribute('aria-pressed', String(on)); p.tag.hidden = !show;
      });
      /* What books the time: the survey's real length and price, kept quietly for the times and the deposit. */
      var z = P.sizes.filter(function (s) { return s.key === pick.size; })[0];
      d.unsure = false;
      var t = z.damp + (pick.service === 'timber' ? z.timber : 0);
      P.extras.forEach(function (x) { if (pick.extras.indexOf(x.key) !== -1) t += x.withSurvey; });
      pick.totalPounds = t; pick.minutes = z.minutes + 30 * pick.extras.length;
    }
    sync();
  }

  global.HTNEED = { draw: draw, recommended: recommended };
})(window);
