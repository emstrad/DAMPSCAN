/* Company, Growth (the owners' plan, 15 Nov 2026): what Google Ads costs
   against what it brings, the funnel month by month and every source over
   the company year. Figures from lib/company-growth.js; ad spend is what is
   logged on Money (Add cost, Google Ads). */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var money = function (p) { if (p === null || p === undefined) return 'none yet'; var n = Number(p) || 0; return '£' + Math.round(n / 100).toLocaleString('en-GB'); };
  var mon = function (ym) { return new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }); };
  var pc = function (a, b) { return b ? Math.round(100 * a / b) + '%' : 'none'; };
  var loaded = false;

  (global.DSCOTABS = global.DSCOTABS || {}).growth = function () { if (!loaded) load(); };

  async function load() {
    var box = document.getElementById('tab-growth');
    var d;
    try { d = await U.get('/api/admin/pay?view=growth'); } catch (e) { box.textContent = 'Growth is for the owners.'; return; }
    loaded = true; box.textContent = '';
    var sec = function (title) { var s = node('section', 'mn-sec'); s.appendChild(node('h2', null, title)); box.appendChild(s); return s; };
    var tile = function (into, label, value, sub, cls) { var t = node('div', 'mn-tile' + (cls ? ' ' + cls : '')); t.appendChild(node('small', null, label)); t.appendChild(node('b', null, value)); if (sub) t.appendChild(node('span', null, sub)); into.appendChild(t); };

    /* Google Ads, with the period picked by pill: this month, last month, the year. */
    var ads = sec('Google Ads');
    var pills = node('div', 'pills pay-range'), body = node('div');
    ads.appendChild(pills); ads.appendChild(body);
    var show = function (key) {
      pills.querySelectorAll('.pill').forEach(function (p) { p.setAttribute('aria-pressed', String(p.dataset.k === key)); });
      var a = d.googleAds[key], t = node('div', 'mn-tiles'); body.textContent = '';
      tile(t, 'Spent', money(a.spend));
      tile(t, 'Enquiries', String(a.enquiries), a.perEnquiry !== null ? money(a.perEnquiry) + ' each' : '');
      tile(t, 'Booked', String(a.booked), a.perBooked !== null ? money(a.perBooked) + ' each' : '');
      tile(t, 'Paid', money(a.money), a.back !== null ? '£' + a.back.toFixed(2) + ' back per £1' : '', a.back !== null && a.back < 1 ? 'is-bad' : '');
      body.appendChild(t);
      if (!a.spend) body.appendChild(node('p', 'mn-say', 'Log the spend on Money (Add cost, Google Ads) to see the cost per booking.'));
    };
    [['month', 'This month'], ['last', 'Last month'], ['year', 'This year']].forEach(function (k) {
      var b = node('button', 'pill', k[1]); b.type = 'button'; b.dataset.k = k[0]; b.addEventListener('click', function () { show(k[0]); }); pills.appendChild(b);
    });
    show('last');

    /* The funnel, month by month: how many came, asked, booked and paid. */
    var f = sec('Month by month');
    var table = node('div', 'gr-table');
    var head = node('div', 'gr-row gr-head');
    ['', 'Visitors', 'Enquiries', 'Booked', 'Paid', 'Money'].forEach(function (h) { head.appendChild(node('span', null, h)); });
    table.appendChild(head);
    d.months.forEach(function (m) {
      var r = node('div', 'gr-row');
      [mon(m.month), String(m.visitors), String(m.enquiries), m.booked + ' (' + pc(m.booked, m.enquiries) + ')', String(m.paid), money(m.money)].forEach(function (c) { r.appendChild(node('span', null, c)); });
      table.appendChild(r);
    });
    f.appendChild(table);

    /* Every source this company year, best money first. */
    var s = sec('Where enquiries came from this year');
    if (!d.sources.length) s.appendChild(node('p', 'mn-say', 'None yet.'));
    var max = Math.max.apply(null, d.sources.map(function (x) { return x.enquiries; }).concat([1]));
    d.sources.forEach(function (x) {
      var r = node('div', 'mn-cost');
      r.appendChild(node('span', null, x.name + ': ' + x.enquiries + ' enquir' + (x.enquiries === 1 ? 'y' : 'ies') + ', ' + x.booked + ' booked'));
      r.appendChild(node('b', null, money(x.money)));
      var bar = node('div', 'mn-bar mn-bar--thin'), fill = node('i'); fill.style.width = Math.round(100 * x.enquiries / max) + '%'; bar.appendChild(fill); r.appendChild(bar);
      s.appendChild(r);
    });
  }
})(window);
