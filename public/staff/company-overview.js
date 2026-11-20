/* Company, Overview (the owners' plan, 15 Nov 2026): what needs an owner now,
   this month against last, what is booked ahead, where the company year is
   heading and the last six months. Figures from lib/company-overview.js; each
   item needing you opens the tab where it is put right. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var money = function (p) { var n = Number(p) || 0; return (n < 0 ? '−' : '') + '£' + Math.round(Math.abs(n) / 100).toLocaleString('en-GB'); };
  var mon = function (ym) { return new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var loaded = false;

  (global.DSCOTABS = global.DSCOTABS || {}).overview = function () { if (!loaded) load(); };

  async function load() {
    var box = document.getElementById('tab-overview');
    var d;
    try { d = await U.get('/api/admin/pay?view=overview'); } catch (e) { box.textContent = 'Overview is for the owners.'; return; }
    loaded = true; box.textContent = '';
    var sec = function (title) { var s = node('section', 'mn-sec'); if (title) s.appendChild(node('h2', null, title)); box.appendChild(s); return s; };
    var tile = function (into, label, value, sub, cls) { var t = node('div', 'mn-tile' + (cls ? ' ' + cls : '')); t.appendChild(node('small', null, label)); t.appendChild(node('b', null, value)); if (sub) t.appendChild(node('span', null, sub)); into.appendChild(t); };

    /* One panel of rows (the owner's clean-up, 16 Nov 2026): what it is, the amount at the right, a blue arrow. */
    var now = sec('Needs you now');
    if (!d.attention.length) now.appendChild(node('p', 'mn-say tide-ok', 'Nothing needs you.'));
    var rows = node('div', 'c-rows ov-rows');
    d.attention.forEach(function (a) {
      var b = node('button', 'c-row' + (a.bad ? ' is-bad' : '')); b.type = 'button';
      var l = node('span', 'c-l'); l.appendChild(node('b', null, a.label || a.text)); if (a.sub) l.appendChild(node('small', null, a.sub));
      var r = node('span', 'c-r'); if (a.figure) r.appendChild(node('span', 'c-amt', a.figure)); r.appendChild(node('span', 'c-chev', '›'));
      b.appendChild(l); b.appendChild(r);
      b.addEventListener('click', function () {
        if (a.href) { global.location.href = a.href; return; }
        if (global.DSCOSHOW) global.DSCOSHOW(a.tab);
        if (a.who && global.DSCOPAY) global.DSCOPAY.open(a.who);
      });
      rows.appendChild(b);
    });
    if (d.attention.length) now.appendChild(rows);

    var m = d.month, grid = node('div', 'mn-tiles');
    /* Last month before the company started has no company money to compare. */
    var was = function (v) { return m.lastBefore ? 'company started ' + day(d.start) : m.lastName + ' ' + v; };
    tile(grid, 'Money in, ' + m.name, money(m.in), was(money(m.lastIn)));
    tile(grid, 'Surveys paid', String(m.surveys), was(m.lastSurveys));
    tile(grid, 'Profit', money(m.profit), was(money(m.lastProfit)), m.profit < 0 ? 'is-bad' : '');
    tile(grid, 'Enquiries', String(m.enquiries), m.booked + ' booked; ' + m.lastName + ' ' + m.lastEnquiries);
    sec('This month').appendChild(grid);

    var a = d.ahead, p = d.projection, ahead = node('div', 'mn-tiles');
    tile(ahead, 'Booked ahead', String(a.surveys), money(a.pence) + ' of surveys');
    tile(ahead, m.name + ' heading for', money(p.monthIn), money(a.thisMonthPence) + ' still booked in');
    sec('Ahead').appendChild(ahead);

    var y = sec('Company year to ' + day(p.yearTo)), yt = node('div', 'mn-tiles');
    tile(yt, 'Money in so far', money(p.yearIn), 'since ' + day(p.yearFrom));
    tile(yt, 'Heading for', money(p.projIn), 'at ' + money(p.pace) + ' a month');
    tile(yt, 'Profit heading for', money(p.projProfit));
    tile(yt, 'Corp tax on that', money(p.projTax));
    y.appendChild(yt);

    var t = sec(d.months.length < 6 ? 'Since the company started' : 'Last six months');
    var max = Math.max.apply(null, d.months.map(function (x) { return x.in; }).concat([1]));
    d.months.forEach(function (x) {
      var r = node('div', 'mn-cost');
      r.appendChild(node('span', null, mon(x.month) + ', ' + x.surveys + ' survey' + (x.surveys === 1 ? '' : 's')));
      r.appendChild(node('b', null, money(x.in)));
      var bar = node('div', 'mn-bar mn-bar--thin'), fill = node('i'); fill.style.width = Math.round(100 * x.in / max) + '%'; bar.appendChild(fill); r.appendChild(bar);
      t.appendChild(r);
    });
    if (d.before && d.before.in) t.appendChild(node('p', 'mn-say', 'Before the company: ' + money(d.before.in) + ', ' + d.before.surveys + ' surveys, in Revolut. Not counted here.'));
  }
})(window);
