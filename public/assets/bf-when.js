/* The booking form's step 3, When suits you? (bf.js). A real free time for their
   postcode and survey length, booked on the tap. Quick to show (the owner,
   26 Nov 2026: "Not sure, continue" took a while): the step opens at once,
   the first two weeks arrive first and the rest of the eight load behind
   them. The bottom bar is the same as step 2's, holding "Call me"
   as a real button, which tells the team straight away. */
(function (global) {
  'use strict';
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* h: { api, d, go, nice, short, clock } from bf.js. */
  function draw(pane, h) {
    var d = h.d, api = h.api;
    pane.appendChild(el('h2', 'ht-h', 'When suits you?'));
    var quick = el('div', 'ht-quick'), nav = el('div', 'ht-week'), days = el('div', 'ht-days'), times = el('div', 'ht-times');
    var wait = el('p', 'ht-sub ht-finding', 'Finding the next free times near you\u2026'), anytime = el('p', 'ht-sub ht-small', 'Change your time anytime from your page.');
    [quick, nav, days, times, wait, anytime].forEach(function (x) { pane.appendChild(x); });
    nav.hidden = days.hidden = true;

    /* One bar at the foot, as on step 2: the reassurance on the left, the way out on the right. */
    var bar = el('div', 'ht-total ht-bar'), said = el('div'), call = el('button', 'btn btn--ghost btn--lg ht-callme', 'Call me'); call.type = 'button';
    said.appendChild(el('span', null, 'Not sure on times?'));
    bar.appendChild(said); bar.appendChild(call); pane.appendChild(bar);
    call.addEventListener('click', function () { d.when = null; d.callMe = true; api.call(d); h.go(4); });

    var busy = false, by = {}, week = null, first = null, last = null, drawn = false;
    var book = function (dd, t) {
      if (busy) return; busy = true; pane.classList.add('is-busy');
      var s = (by[dd] || []).filter(function (x) { return x.time === t; })[0] || { date: dd, time: t };
      api.pick(d, s).then(function (r) {
        busy = false; pane.classList.remove('is-busy');
        if (r.ok) { d.when = { date: dd, time: t }; d.requested = !r.booked; d.page = r.page || null; h.go(4); return; }
        global.alert(r.error === 'taken' ? 'That time has just gone. Please pick another.' : 'That didn\'t go through. Please try again, or call us.');
        h.go(3);
      });
    };
    var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
    var monday = function (dd) { var t = Date.parse(dd + 'T12:00:00Z'); return t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5; };
    var prev = el('button', 'bt-time ht-arrow', '‹'), next = el('button', 'bt-time ht-arrow', '›'), label = el('b', 'ht-week-label');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Earlier week'); next.setAttribute('aria-label', 'Later week');
    nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next);
    prev.addEventListener('click', function () { week -= 7 * 864e5; drawWeek(); });
    next.addEventListener('click', function () { week += 7 * 864e5; drawWeek(); });

    function show(dd) {
      days.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z.dataset.day === dd)); });
      times.textContent = ''; times.appendChild(el('p', 'ht-day', h.nice(dd)));
      [['Morning', function (t) { return t < '12:00'; }], ['Afternoon', function (t) { return t >= '12:00'; }]].forEach(function (g) {
        var list = by[dd].filter(function (s) { return g[1](s.time); }); if (!list.length) return;
        var grp = el('div', 'ht-tgroup'); grp.appendChild(el('span', 'ht-tlabel', g[0]));
        var row = el('div', 'bt-row');
        list.forEach(function (s) { var t = el('button', 'bt-time', h.clock(s.time)); t.type = 'button'; t.addEventListener('click', function () { book(dd, s.time); }); row.appendChild(t); });
        grp.appendChild(row); times.appendChild(grp);
      });
    }
    function drawWeek(keepDay) {
      days.textContent = ''; var pick = null;
      label.textContent = h.short(iso(week)).replace(/^\w+,? /, '') + ' to ' + h.short(iso(week + 6 * 864e5)).replace(/^\w+,? /, '');
      prev.disabled = week <= first; next.disabled = week >= last;
      for (var i = 0; i < 7; i += 1) {
        var dd = iso(week + i * 864e5), b = el('button', 'bt-time ht-dayb'); b.type = 'button'; b.dataset.day = dd;
        var p = h.short(dd).replace(',', '').split(' '); b.appendChild(el('span', null, p[0])); b.appendChild(el('b', null, p[1]));
        if (!by[dd]) b.disabled = true; else { if (!pick) pick = dd; b.addEventListener('click', show.bind(null, dd)); }
        days.appendChild(b);
      }
      var stay = keepDay && by[keepDay] ? keepDay : pick;
      if (stay) show(stay); else { times.textContent = ''; times.appendChild(el('p', 'ht-sub', 'Nothing free this week.')); }
    }
    function nothing() {
      wait.hidden = true; quick.textContent = '';
      /* Nothing free near them: the bar's button becomes the one way on. */
      quick.appendChild(el('p', 'ht-sub', 'We\'ll find a time that works and call you to arrange it.'));
      call.className = 'btn btn--primary btn--lg ht-callme'; call.textContent = 'Leave it with us';
      said.textContent = ''; anytime.hidden = true;
    }
    /* Each answer adds what it found; the week on screen stays where it is. */
    function take(x, final) {
      if (x.off) { nothing(); return; }
      (x.slots || []).forEach(function (s) { var list = by[s.date] = by[s.date] || []; if (!list.some(function (o) { return o.time === s.time; })) list.push(s); });
      Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return a.time < b.time ? -1 : 1; }); });
      var free = Object.keys(by).sort();
      if (!free.length) { if (final) nothing(); return; }
      wait.hidden = true; nav.hidden = days.hidden = false;
      first = monday(free[0]); last = monday(free[free.length - 1]);
      if (!drawn) {
        var e = by[free[0]][0], eb = el('button', 'ht-earliest'); eb.type = 'button';
        eb.appendChild(el('span', null, 'Earliest')); eb.appendChild(el('b', null, h.short(free[0]) + ', ' + h.clock(e.time)));
        eb.addEventListener('click', function () { book(free[0], e.time); }); quick.appendChild(eb);
        week = first; drawn = true; drawWeek();
      } else {
        var on = days.querySelector('[aria-pressed="true"]'); drawWeek(on && on.dataset.day);
      }
    }
    api.times(d, 14).then(function (x) {
      take(x, false);
      return api.times(d, 56).then(function (y) { take(y, true); });
    }).catch(function () { if (!drawn) { wait.hidden = true; nothing(); } });
  }

  global.HTWHEN = { draw: draw };
})(window);
