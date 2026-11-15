/* The booking trial's step 2 (the owner's brief, 15 Nov 2026, second pass):
   one clean screen. What they are dealing with as picture tiles, then the
   survey as it is today (damp or damp and timber, the four sizes, every add-on),
   each with its small (i), and a Recommended tag on whatever fits what they
   ticked, never ticked for them. Nothing step 1 asked is asked again: the
   estate agent letting us in already says they are buying. Prices from the one
   list; drawn into the opened-out card by home-trial.js; nothing is sent. */
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

  /* What fits what they ticked: the reason shows on the tag's (i). */
  function recommended(d) {
    var r = { service: has(d, 'Timber / Woodworm') ? 'timber' : 'damp', size: d.agent ? 'full-house' : null, extras: {} };
    if (has(d, 'Leak / Water damage') || d.agent) r.extras.drone = d.agent ? 'You are buying and cannot see the roof up close.' : 'A leak often starts on the roof, chimney or gutters.';
    if (has(d, 'Timber / Woodworm')) r.extras.camera = 'Woodworm and rot often start under suspended floors.';
    if (has(d, 'Damp') || has(d, 'Cold / condensation')) r.extras.cavity = 'Damp low on an outside wall is often a bridged cavity.';
    if (has(d, 'Leak / Water damage') && has(d, 'Damp')) r.extras.invasive = 'Hidden water paths sometimes need a small, agreed opening to find.';
    return r;
  }

  function info(row, text, label) {
    var i = el('button', 'bt-info', 'i'); i.type = 'button'; i.setAttribute('aria-label', 'What is ' + label + '?'); i.setAttribute('aria-expanded', 'false');
    var p = el('p', 'bt-infotext ht-info', text); p.hidden = true;
    i.addEventListener('click', function (e) { e.stopPropagation(); p.hidden = !p.hidden; i.setAttribute('aria-expanded', String(!p.hidden)); });
    row.appendChild(i); row.appendChild(p);
  }
  var tag = function () { return el('span', 'ht-rec', 'Recommended'); };

  /* d: the answers so far; P: the price list; done(): on to the times. */
  function draw(box, d, P, done) {
    box.textContent = '';
    var rec = recommended(d);
    if (!d.pick) d.pick = { service: null, size: null, extras: [] };
    var pick = d.pick;
    var redraw = function () { draw(box, d, P, done); };

    var grid = el('div', 'ht-need');
    var left = el('div', 'ht-need-q'), right = el('div', 'ht-need-pick');
    grid.appendChild(left); grid.appendChild(right); box.appendChild(grid);

    left.appendChild(el('h2', 'ht-h', 'What are you dealing with?'));
    var tiles = el('div', 'ht-tiles');
    ISSUES.forEach(function (it) {
      var t = el('button', 'ht-tile'); t.type = 'button'; t.setAttribute('aria-pressed', String(has(d, it[0])));
      t.innerHTML = '<span class="ht-tile-ico">' + it[2] + '</span>';
      t.appendChild(el('b', null, it[0])); t.appendChild(el('span', 'ht-tile-say', it[1]));
      t.addEventListener('click', function () { var i = d.issues.indexOf(it[0]); if (i === -1) d.issues.push(it[0]); else d.issues.splice(i, 1); redraw(); });
      tiles.appendChild(t);
    });
    left.appendChild(tiles);

    right.appendChild(el('h2', 'ht-h', 'Your survey'));
    var types = el('div', 'ht-opts ht-opts--2');
    [['damp', P.services.damp], ['timber', P.services.timber]].forEach(function (s) {
      var row = el('div', 'bt-pick ht-opt');
      var b = el('button', 'bt-survey'); b.type = 'button'; b.setAttribute('aria-pressed', String(pick.service === s[0]));
      b.appendChild(el('b', null, s[1].name)); if (rec.service === s[0]) b.appendChild(tag());
      b.addEventListener('click', function () { pick.service = s[0]; redraw(); });
      row.appendChild(b); info(row, s[1].info, s[1].name); types.appendChild(row);
    });
    right.appendChild(types);

    right.appendChild(el('p', 'ht-label', 'How much of the home?'));
    var sizes = el('div', 'ht-opts ht-opts--2');
    P.sizes.forEach(function (z) {
      var row = el('div', 'bt-pick ht-opt');
      var b = el('button', 'bt-survey'); b.type = 'button'; b.setAttribute('aria-pressed', String(pick.size === z.key));
      var top = el('span', 'ht-opt-top'); top.appendChild(el('b', null, z.name)); top.appendChild(el('span', 'bt-price', pounds(z.damp + (pick.service === 'timber' ? z.timber : 0), z.from)));
      b.appendChild(top); b.appendChild(el('span', 'ht-opt-say', z.scope)); if (rec.size === z.key) b.appendChild(tag());
      b.addEventListener('click', function () { pick.size = z.key; redraw(); });
      row.appendChild(b); info(row, z.info, z.name); sizes.appendChild(row);
    });
    right.appendChild(sizes);

    right.appendChild(el('p', 'ht-label', 'Add on the same visit'));
    var adds = el('div', 'ht-opts');
    P.extras.filter(function (x) { return x.addable; }).forEach(function (x) {
      var on = pick.extras.indexOf(x.key) !== -1, why = rec.extras[x.key];
      var row = el('div', 'bt-pick ht-opt');
      var b = el('button', 'bt-survey ht-add'); b.type = 'button'; b.setAttribute('aria-pressed', String(on));
      var box2 = el('span', 'ht-box'); box2.innerHTML = on ? TICK : '';
      var top = el('span', 'ht-opt-top'); top.appendChild(box2); top.appendChild(el('b', null, x.name)); top.appendChild(el('span', 'bt-price', '+' + pounds(x.withSurvey, x.from)));
      b.appendChild(top); if (why) { b.appendChild(tag()); b.appendChild(el('span', 'ht-opt-say', why)); }
      b.addEventListener('click', function () { var i = pick.extras.indexOf(x.key); if (i === -1) pick.extras.push(x.key); else pick.extras.splice(i, 1); redraw(); });
      row.appendChild(b); info(row, x.scope + '. ' + x.info, x.name); adds.appendChild(row);
    });
    right.appendChild(adds);

    /* The total, the deposit and the way on, once a type and a size are chosen. */
    var z = P.sizes.filter(function (s) { return s.key === pick.size; })[0];
    var bar = el('div', 'ht-total');
    if (z && pick.service) {
      var t = z.damp + (pick.service === 'timber' ? z.timber : 0), from = z.from;
      P.extras.forEach(function (x) { if (pick.extras.indexOf(x.key) !== -1) { t += x.withSurvey; from = from || Boolean(x.from); } });
      pick.totalPounds = t; pick.minutes = z.minutes + 30 * pick.extras.length;
      var sum = el('div'); sum.appendChild(el('b', null, pounds(t, from))); sum.appendChild(el('span', null, '£' + (t / 2).toFixed(t % 2 ? 2 : 0) + ' deposit to book'));
      bar.appendChild(sum);
    } else bar.appendChild(el('span', 'ht-sub', !pick.service ? 'Choose damp, or damp and timber.' : 'Choose how much of the home.'));
    var go = el('button', 'btn btn--primary btn--lg', 'Choose a time'); go.type = 'button'; go.disabled = !(z && pick.service && d.issues.length);
    go.addEventListener('click', done);
    bar.appendChild(go);
    right.appendChild(bar);
    if (!d.issues.length) right.appendChild(el('p', 'ht-sub ht-hint', 'Tick what you are dealing with first.'));
  }

  global.HTNEED = { draw: draw, recommended: recommended };
})(window);
