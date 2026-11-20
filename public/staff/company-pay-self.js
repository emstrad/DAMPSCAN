/* Pay, Paying yourselves (the owner, 20 Nov 2026: "interactive charts, easy to
   glance, not a tick list"). For Scott and Tom: the dividend to take now as the
   hero; the 10.75% band as one bar (salary, dividends taken, take now, room
   left; amber past the higher rate); mileage as a column a month with one
   Claim; the seven steps as a score with only what is left as one-tap actions;
   and the year ahead as a timeline. Tap or hover any mark for its figure.
   Figures from lib/pay-self.js; claims are Mileage and Use of home costs. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var money = function (p) { var n = Number(p) || 0; return (n < 0 ? '−' : '') + '£' + Math.round(Math.abs(n) / 100).toLocaleString('en-GB'); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var mon = function (m) { return new Date(m + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }); };
  var monthEnd = function (m) { var d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  var claim = function (miles, before) { var a = Math.max(0, Math.min(miles, 10000 - before)); return a * 45 + (miles - a) * 25; };
  var loaded = false;

  (global.DSCOTABS = global.DSCOTABS || {}).pay = function () { if (!loaded) load(); };

  /* One readout line under a chart: tapping or hovering a mark writes its figure there. */
  function readout() { var r = node('div', 'ps-read'); r.setAttribute('aria-live', 'polite'); return r; }
  function mark(el, text, out) {
    el.tabIndex = 0; el.setAttribute('role', 'img'); el.setAttribute('aria-label', text); el.title = text;
    var show = function () { out.textContent = text; };
    el.addEventListener('mouseenter', show); el.addEventListener('focus', show); el.addEventListener('click', show);
  }
  async function send(btn, body, ask) {
    if (ask && !global.confirm(ask)) return;
    btn.disabled = true;
    var r = await U.send('/api/admin/pay', body).catch(function () { return { ok: false }; });
    if (!r.ok) { btn.disabled = false; global.alert((r.data && r.data.error) || 'Not saved.'); return; }
    loaded = false; load();
  }
  function action(label, cls, fn) { var b = node('button', 'ps-act' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', function () { fn(b); }); return b; }

  /* The basic-rate band, £0 to £50,270, as one bar. */
  function bandBar(p, rates) {
    var wrap = node('div', 'ps-band'), out = readout();
    var top = rates.basicTop, salary = Math.max(p.salary, rates.allowance);
    var bar = node('div', 'ps-bar');
    var seg = function (cls, pence, text) { if (pence <= 0) return; var s = node('i', 'ps-seg ' + cls); s.style.width = Math.max(1.5, 100 * pence / top) + '%'; mark(s, text, out); bar.appendChild(s); };
    seg('is-salary', salary, 'Salary ' + money(salary) + ' (tax free)');
    seg('is-taken', Math.min(p.dividends, top - salary), 'Dividends taken ' + money(p.dividends));
    seg('is-now', p.takeNow, 'Take now ' + money(p.takeNow) + ' at 10.75%');
    seg('is-room', p.room - p.takeNow, 'Band left after that ' + money(p.room - p.takeNow));
    wrap.appendChild(bar);
    if (p.over) { var o = node('div', 'ps-over'); mark(o, money(p.over) + ' over, taxed at 35.75%', out); o.textContent = money(p.over) + ' over the band'; wrap.appendChild(o); }
    var scale = node('div', 'ps-scale'); scale.appendChild(node('span', null, '£0')); scale.appendChild(node('span', null, '£50,270 higher rate')); wrap.appendChild(scale);
    out.textContent = money(p.room) + ' left at 10.75% · tax so far ' + money(p.tax);
    wrap.appendChild(out);
    return wrap;
  }

  /* Miles a month as columns: unclaimed months lit, one button claims them all. */
  function miles(p) {
    var m = p.mileage, box = node('div', 'ps-miles'), out = readout();
    var head = node('div', 'ps-mh'); head.appendChild(node('b', null, 'Mileage')); head.appendChild(node('small', null, m.miles + ' miles this tax year' + (m.home ? '' : ' · no home area set')));
    box.appendChild(head);
    if (!m.months.length) { box.appendChild(node('small', 'ps-none', 'No survey days yet.')); return box; }
    var max = Math.max.apply(null, m.months.map(function (x) { return x.claimed ? x.claimed.miles : x.miles; }).concat([1]));
    var cols = node('div', 'ps-cols');
    m.months.slice(-12).forEach(function (x) {
      var mi = x.claimed ? x.claimed.miles : x.miles, c = node('div', 'ps-col');
      var b = node('i', x.claimed ? 'is-claimed' : x.open ? 'is-due' : 'is-running'); b.style.height = Math.max(4, Math.round(56 * mi / max)) + 'px';
      mark(c, mon(x.month) + ': ' + mi + ' miles, ' + money(x.claimed ? x.claimed.pence : x.pence) + (x.claimed ? ' claimed' : x.open ? ' to claim' : ' so far'), out);
      c.appendChild(b); c.appendChild(node('small', null, mon(x.month))); cols.appendChild(c);
    });
    box.appendChild(cols);
    var due = m.toClaim, total = due.reduce(function (t, x) { return t + x.pence; }, 0);
    out.textContent = due.length ? money(total) + ' to claim' : money(m.claimedPence) + ' claimed, nothing owed';
    box.appendChild(out);
    if (due.length) box.appendChild(action('Claim ' + money(total), 'is-primary', function (b) {
      /* One cost per month, so the bank check and the 10,000 miles count month by month. */
      b.disabled = true;
      due.reduce(function (pr, x) { return pr.then(function () { return U.send('/api/admin/pay', { op: 'expense', pence: claim(x.miles, x.before), day: monthEnd(x.month), category: 'Mileage', what: p.name + ' ' + x.month + ': ' + x.miles + ' miles' }); }); }, Promise.resolve())
        .then(function () { loaded = false; load(); });
    }));
    return box;
  }

  function person(p, d) {
    var c = node('div', 'ps-card');
    var hero = node('div', 'ps-hero'); hero.appendChild(node('small', null, p.name + ' can take now')); hero.appendChild(node('b', null, money(p.takeNow)));
    hero.appendChild(node('span', null, p.takeNow ? 'as a dividend at 10.75%' : p.owed <= 0 ? 'nothing owed on Pay yet' : 'company profit or band used'));
    c.appendChild(hero); c.appendChild(bandBar(p, d.rates)); c.appendChild(miles(p));
    return c;
  }

  /* The seven steps as a score; only what is left shows, each as its action. */
  function score(d) {
    var counted = d.steps.filter(function (s) { return s.done !== null; }), done = counted.filter(function (s) { return s.done; }).length;
    var box = node('div', 'ps-score'), pct = counted.length ? done / counted.length : 1;
    var ring = node('div', 'ps-ring'); ring.style.setProperty('--p', String(Math.round(pct * 100)));
    ring.appendChild(node('b', null, done + '/' + counted.length)); ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', done + ' of ' + counted.length + ' steps done');
    box.appendChild(ring);
    var right = node('div', 'ps-todo'); right.appendChild(node('b', null, done === counted.length ? 'Running tax-efficiently' : 'To be more tax-efficient'));
    var acts = node('div', 'ps-acts');
    d.people.filter(function (p) { return !p.salaryThisMonth; }).forEach(function (p) {
      acts.appendChild(action('Log ' + p.name + "'s salary", '', function (b) { send(b, { op: 'pay', who: p.key, how: 'Salary', pence: d.rates.salaryMonth, day: d.today, note: 'Monthly salary' }, 'Log £1,047.50 salary paid to ' + p.name + ' today?'); }));
    });
    var home = d.steps.filter(function (s) { return s.n === 4; })[0];
    if (home && !home.done) d.people.forEach(function (p) { acts.appendChild(action('Claim use of home, ' + p.name, '', function (b) { send(b, { op: 'expense', pence: d.rates.homeMonth, day: d.today, category: 'Use of home', what: p.name + ' ' + d.today.slice(0, 7) }); })); });
    d.steps.filter(function (s) { return s.done === false && (s.n === 2 || s.n === 6); }).forEach(function (s) { var t = node('span', 'c-tag is-warn', s.n === 2 ? 'Over the 10.75% band' : s.say); acts.appendChild(t); });
    if (d.people.some(function (p) { return p.mileage.toClaim.length; })) acts.appendChild(node('span', 'c-tag', 'Mileage to claim above'));
    right.appendChild(acts);
    var all = node('details', 'ps-all'); all.appendChild(node('summary', null, 'All seven'));
    d.steps.forEach(function (s) { all.appendChild(node('div', 'ps-step' + (s.done ? ' is-done' : ''), s.n + '. ' + s.title + ' · ' + s.say)); });
    right.appendChild(all); box.appendChild(right);
    return box;
  }

  /* The next twelve months as one track, each date a dot; the nearest named above. */
  function timeline(d) {
    var box = node('div', 'ps-time'), out = readout(), list = d.milestones.filter(function (x) { return x.days <= 366; });
    if (!list.length) return box;
    box.appendChild(node('b', null, 'Next: ' + list[0].what + ', ' + (list[0].days === 0 ? 'today' : 'in ' + list[0].days + ' day' + (list[0].days === 1 ? '' : 's'))));
    var track = node('div', 'ps-track');
    list.forEach(function (x, i) {
      var dot = node('i', 'ps-dot' + (x.days <= 14 ? ' is-soon' : '') + (i === 0 ? ' is-next' : ''));
      dot.style.left = Math.min(98, Math.max(1, 100 * x.days / 366)) + '%';
      mark(dot, day(x.day) + ': ' + x.what + '. ' + x.say, out); track.appendChild(dot);
    });
    box.appendChild(track);
    var ends = node('div', 'ps-scale'); ends.appendChild(node('span', null, 'Today')); ends.appendChild(node('span', null, '12 months')); box.appendChild(ends);
    out.textContent = list[0].say; box.appendChild(out);
    return box;
  }

  async function load() {
    var box = document.getElementById('pay-self'); if (!box) return;
    var d; try { d = await U.get('/api/admin/pay?view=self'); } catch (e) { return; }
    loaded = true; box.textContent = '';
    var h = node('div', 'ps-head'); h.appendChild(node('h2', null, 'Paying yourselves')); h.appendChild(node('span', 'c-tag', 'Tax year ' + d.taxYear.label)); box.appendChild(h);
    var grid = node('div', 'ps-grid'); d.people.forEach(function (p) { grid.appendChild(person(p, d)); }); box.appendChild(grid);
    box.appendChild(score(d));
    box.appendChild(timeline(d));
    box.appendChild(node('p', 'mn-say', 'Company can pay ' + money(d.headroom) + ' from profit after tax. Assumes no other income.'));
  }
})(window);
