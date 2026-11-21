/* The booking form's step 2 (bf.js; the owner's brief, 15 Nov 2026, third pass):
   one clean screen in four numbered parts, each ticked once answered: 1 what
   they are dealing with, 2 the survey, 3 how much of the home, 4 add-ons. Built
   once and changed in place, so a tap never moves the page: a Recommended tag
   sits on the box's edge (no height of its own) and an (i) opens a floating
   note, a sheet from the bottom on a phone, with why it is recommended. Never
   ticked for them; nothing step 1 asked is asked again. Prices from the one
   list; nothing is sent. The total stays pinned to the bottom of the screen. */
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
    ['Something else', 'Something is not right', svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>')]
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
  function head(n, text, extra) {
    var h = el('div', 'ht-head'); var num = el('span', 'ht-num', String(n)); num.dataset.n = n;
    h.appendChild(num); h.appendChild(el('h2', 'ht-h', text)); if (extra) h.appendChild(el('span', 'ht-opt-note', extra));
    return { row: h, num: num };
  }

  /* d: the answers so far; P: the price list; done(): on to the times. */
  function draw(box, d, P, done) {
    box.textContent = ''; closePop();
    if (!d.pick) d.pick = { service: null, size: null, extras: [] };
    var pick = d.pick, rec = recommended(d), parts = [];
    var narrow = function () { return global.innerWidth <= 980; };
    var grid = el('div', 'ht-need'), left = el('div', 'ht-need-q'), right = el('div', 'ht-need-pick'), wide = el('div', 'ht-need-wide');
    grid.appendChild(left); grid.appendChild(right); box.appendChild(grid); box.appendChild(wide);
    function option(row, b, recKey, why) {
      var t = el('span', 'ht-rec ht-rec--edge', 'Recommended'); t.hidden = true; b.appendChild(t);
      parts.push({ b: b, tag: t, recKey: recKey }); row.appendChild(b); return why;
    }
    function nextUp(target) { if (narrow() && target) setTimeout(function () { var y = target.getBoundingClientRect().top + global.scrollY - 90; global.scrollTo({ top: y, behavior: 'smooth' }); }, 120); }

    var h1 = head(1, 'What are you dealing with?'); left.appendChild(h1.row);
    var tiles = el('div', 'ht-tiles');
    ISSUES.forEach(function (it) {
      var t = el('button', 'ht-tile'); t.type = 'button'; t.dataset.issue = it[0];
      t.innerHTML = '<span class="ht-tile-ico">' + it[2] + '</span>';
      t.appendChild(el('b', null, it[0])); t.appendChild(el('span', 'ht-tile-say', it[1]));
      t.addEventListener('click', function () { var i = d.issues.indexOf(it[0]); if (i === -1) d.issues.push(it[0]); else d.issues.splice(i, 1); sync(); });
      tiles.appendChild(t);
    });
    left.appendChild(tiles);

    var h2 = head(2, 'Your survey'); right.appendChild(h2.row);
    var types = el('div', 'ht-opts ht-opts--2');
    [['damp', P.services.damp], ['timber', P.services.timber]].forEach(function (s) {
      var row = el('div', 'bt-pick ht-opt'), b = el('button', 'bt-survey'); b.type = 'button'; b.dataset.service = s[0];
      b.appendChild(el('b', null, s[1].name));
      /* A second tap unticks it, so changing their mind to Not sure leaves nothing stuck on. */
      b.addEventListener('click', function () { var first = !pick.service; pick.service = pick.service === s[0] ? null : s[0]; sync(); if (first && pick.service) nextUp(h3.row); });
      option(row, b, 'service:' + s[0]);
      row.appendChild(infoBtn(s[1].name, s[1].info, function () { return rec.service === s[0] ? rec.why.service : ''; })); types.appendChild(row);
    });
    right.appendChild(types);

    var h3 = head(3, 'How much of the home?'); right.appendChild(h3.row);
    var sizes = el('div', 'ht-opts ht-opts--2'), sizePrice = {};
    P.sizes.forEach(function (z) {
      var row = el('div', 'bt-pick ht-opt'), b = el('button', 'bt-survey'); b.type = 'button'; b.dataset.size = z.key;
      var top = el('span', 'ht-opt-top'); top.appendChild(el('b', null, z.name)); sizePrice[z.key] = el('span', 'bt-price'); top.appendChild(sizePrice[z.key]);
      b.appendChild(top); b.appendChild(el('span', 'ht-opt-say', z.scope));
      b.addEventListener('click', function () { var first = !pick.size; pick.size = pick.size === z.key ? null : z.key; sync(); if (first && pick.size) nextUp(h4.row); });
      option(row, b, 'size:' + z.key);
      row.appendChild(infoBtn(z.name, z.info, function () { return rec.size === z.key ? rec.why.size : ''; })); sizes.appendChild(row);
    });
    right.appendChild(sizes);

    var h4 = head(4, 'Add on the same visit', 'Optional'); wide.appendChild(h4.row);
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
    wide.appendChild(adds);

    /* Pinned to the bottom of the screen: the total, the deposit and what is still missing. */
    /* Your real rules, beside the price: people book more when they can see them. */
    var promise = el('ul', 'ht-promise');
    ['50% deposit, the rest after the visit', 'Change your time free from your page', 'Full refund up to 48 hours before'].forEach(function (t) { var li = el('li'); li.innerHTML = TICK; li.appendChild(document.createTextNode(t)); promise.appendChild(li); });
    box.appendChild(promise);
    var bar = el('div', 'ht-total'), sum = el('div'), go = el('button', 'btn btn--primary btn--lg'); go.type = 'button';
    bar.appendChild(sum); bar.appendChild(go); box.appendChild(bar);
    /* Never greyed out, and never choosing for them (the owner, 21 Nov 2026): with no survey and
       size picked it is "Not sure, continue", on to the times all the same, and we confirm the survey on a call. */
    go.addEventListener('click', function () {
      if (!(pick.service && pick.size)) { pick.service = null; pick.size = null; pick.extras = []; d.unsure = true; }
      done(go);
    });

    function sync() {
      rec = recommended(d);
      tiles.querySelectorAll('.ht-tile').forEach(function (t) { t.setAttribute('aria-pressed', String(has(d, t.dataset.issue))); });
      parts.forEach(function (p) {
        var k = p.recKey.split(':'), on = false, show = false;
        if (k[0] === 'service') { on = pick.service === k[1]; show = rec.service === k[1]; }
        if (k[0] === 'size') { on = pick.size === k[1]; show = rec.size === k[1]; }
        if (k[0] === 'extra') { on = pick.extras.indexOf(k[1]) !== -1; show = Boolean(rec.extras[k[1]]); ticks[k[1]].innerHTML = on ? TICK : ''; }
        p.b.setAttribute('aria-pressed', String(on)); p.tag.hidden = !show;
      });
      P.sizes.forEach(function (z) { sizePrice[z.key].textContent = pounds(z.damp + (pick.service === 'timber' ? z.timber : 0), z.from); });
      [[h1, d.issues.length], [h2, pick.service], [h3, pick.size], [h4, pick.extras.length]].forEach(function (h) {
        h[0].num.classList.toggle('is-done', Boolean(h[1])); h[0].num.innerHTML = h[1] ? TICK : h[0].num.dataset.n;
      });
      var z = P.sizes.filter(function (s) { return s.key === pick.size; })[0];
      sum.textContent = '';
      /* No survey and size picked yet: they can still carry on, unsure, to the times. */
      var chosen = Boolean(z && pick.service);
      d.unsure = !chosen;
      pick.totalPounds = null; pick.minutes = chosen ? null : (P.sizes.filter(function (s) { return s.key === 'full-house'; })[0] || {}).minutes || null;
      if (chosen) {
        var t = z.damp + (pick.service === 'timber' ? z.timber : 0), from = z.from;
        P.extras.forEach(function (x) { if (pick.extras.indexOf(x.key) !== -1) { t += x.withSurvey; from = from || Boolean(x.from); } });
        pick.totalPounds = t; pick.minutes = z.minutes + 30 * pick.extras.length;
        sum.appendChild(el('b', null, pounds(t, from))); /* An agent or outside our area books nothing here, so no deposit is mentioned (Annie, 16 Nov 2026, thought she had bought). */
        sum.appendChild(el('span', null, d.agent || d.outside ? 'Nothing to pay now. We\'ll confirm the time first' : '£' + (t / 2).toFixed(t % 2 ? 2 : 0) + ' deposit to book'));
      } else sum.appendChild(el('span', null, 'Not sure? Carry on and we\'ll help you choose'));
      var send = d.agent || d.outside;
      go.textContent = !chosen ? 'Not sure, continue' : send ? 'Send my details' : 'Choose a time';
      go.disabled = false;
    }
    sync();
  }

  global.HTNEED = { draw: draw, recommended: recommended };
})(window);
