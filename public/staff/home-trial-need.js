/* The booking trial's step 2 (the owner's brief, 15 Nov 2026): what they are
   dealing with, as big picture tiles, a couple of quick questions, and beside
   them what we would book and why, priced from the one list (survey-pick.js,
   the same piece the Lab tries). Drawn into the full screen stage by
   home-trial.js; nothing here is sent anywhere. */
(function (global) {
  'use strict';
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var svg = function (paths) { return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; };
  var ISSUES = [
    ['Damp', 'Tide marks, peeling paint, a wet patch that will not dry', svg('<path d="M12 3c3.5 4.4 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.6 6-11z"/>')],
    ['Mould', 'Black spots in corners, a musty smell', svg('<circle cx="8" cy="9" r="2.2"/><circle cx="15.5" cy="7.5" r="1.6"/><circle cx="14" cy="15" r="2.6"/><circle cx="7.5" cy="16.5" r="1.3"/>')],
    ['Timber / Woodworm', 'Small holes, soft or crumbling wood, bouncy floors', svg('<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="8" cy="12" r=".9"/><circle cx="12.5" cy="10.5" r=".9"/><circle cx="15.5" cy="13.5" r=".9"/>')],
    ['Leak / Water damage', 'Stains after rain, drips, a ceiling that has marked', svg('<path d="M4 10h16"/><path d="M7 10V6h10v4"/><path d="M9 14v2M12 15v3M15 14v2"/>')],
    ['Cold / condensation', 'Streaming windows, cold walls, mould behind furniture', svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8v3M13 7v5M16 9v2"/>')],
    ['Not sure', 'Something is not right and you want it found', svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>')]
  ];
  var WHERE = [['low', 'Low on walls'], ['high', 'Upstairs or on a ceiling'], ['floors', 'Floors or a musty smell']];
  var WHY = [
    ['Independent', 'Survey only: we sell no treatment, so the report has nothing to sell you.'],
    ['Readings and photos', 'Every finding measured and photographed, the cause named in plain words.'],
    ['Next-day report', 'Your written report the day after the visit, yours to keep.']
  ];

  function chips(into, label, options, picked, multi, onPick) {
    var row = el('div', 'form-row');
    row.appendChild(el('label', null, label));
    var wrap = el('div', 'ht-chips');
    options.forEach(function (o) {
      var b = el('button', 'ht-chip', o[1]); b.type = 'button';
      var on = multi ? picked.indexOf(o[0]) !== -1 : picked === o[0];
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', function () { onPick(o[0]); });
      wrap.appendChild(b);
    });
    row.appendChild(wrap); into.appendChild(row);
  }

  /* d is the trial's answers so far; prices from the Lab route; done(pick) moves to the times. */
  function draw(box, d, prices, done) {
    box.textContent = '';
    var grid = el('div', 'ht-need');
    var left = el('div', 'ht-need-q'), right = el('div', 'ht-need-pick');
    grid.appendChild(left); grid.appendChild(right); box.appendChild(grid);

    left.appendChild(el('h2', 'ht-h', 'What are you dealing with?'));
    left.appendChild(el('p', 'ht-sub', 'Tick anything that applies.'));
    var tiles = el('div', 'ht-tiles');
    ISSUES.forEach(function (it) {
      var on = d.issues.indexOf(it[0]) !== -1;
      var t = el('button', 'ht-tile'); t.type = 'button'; t.setAttribute('aria-pressed', String(on));
      t.innerHTML = '<span class="ht-tile-ico">' + it[2] + '</span>';
      t.appendChild(el('b', null, it[0])); t.appendChild(el('span', 'ht-tile-say', it[1]));
      t.addEventListener('click', function () {
        var i = d.issues.indexOf(it[0]);
        if (i === -1) d.issues.push(it[0]); else d.issues.splice(i, 1);
        draw(box, d, prices, done);
      });
      tiles.appendChild(t);
    });
    left.appendChild(tiles);

    var q = el('div', 'ht-qs');
    chips(q, 'Is this for a purchase?', [['buying', 'I\'m buying it'], ['own', 'It\'s my home']], d.why, false, function (v) { d.why = v; draw(box, d, prices, done); });
    if (d.why === 'own') chips(q, 'How much is affected?', [['one', 'One area'], ['whole', 'Several rooms']], d.scope, false, function (v) { d.scope = v; draw(box, d, prices, done); });
    chips(q, 'Bedrooms', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']], d.beds, false, function (v) { d.beds = v; draw(box, d, prices, done); });
    chips(q, 'Where is it? (any)', WHERE, d.where, true, function (v) { var i = d.where.indexOf(v); if (i === -1) d.where.push(v); else d.where.splice(i, 1); draw(box, d, prices, done); });
    left.appendChild(q);

    right.appendChild(el('h2', 'ht-h', 'What you need'));
    var ready = d.issues.length && d.why && d.beds && (d.why === 'buying' || d.scope);
    if (!ready) {
      var wait = el('div', 'ht-wait');
      wait.appendChild(el('p', null, 'Tell us what you\'re seeing and we\'ll show the survey we\'d book, what\'s in it and the price.'));
      var why = el('ul', 'ht-why');
      WHY.forEach(function (w) { var li = el('li'); li.appendChild(el('b', null, w[0])); li.appendChild(el('span', null, w[1])); why.appendChild(li); });
      wait.appendChild(why); right.appendChild(wait);
      return;
    }
    var pickBox = el('div', 'ht-pickbox'); right.appendChild(pickBox);
    global.SurveyPick.mount(pickBox, {
      prices: prices, cta: 'Choose a time',
      known: { buying: d.why === 'buying', agent: Boolean(d.agent), beds: Number(d.beds), scope: d.scope, timber: d.issues.indexOf('Timber / Woodworm') !== -1,
        floors: d.where.indexOf('floors') !== -1, lowWall: d.where.indexOf('low') !== -1, high: d.where.indexOf('high') !== -1 || d.issues.indexOf('Leak / Water damage') !== -1 },
      onChoose: function (pick) { d.pick = pick; done(); }
    });
  }

  global.HTNEED = { draw: draw };
})(window);
