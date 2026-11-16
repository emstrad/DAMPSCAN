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

  /* Paid customers sent back to Google Ads (lib/ads-conversions.js): when Google last came for each
     brand's file, how many are in it, and the address to give it once. Owners only, like the page. */
  var BRAND = { 'ati-london': 'ATi', dampscan: 'DampScan' };
  function feedFold(feeds) {
    var d = document.createElement('details'); d.className = 'pay-surveys';
    var seen = feeds.filter(function (f) { return f.lastFetched; });
    var s = document.createElement('summary'); s.className = 'c-row';
    var l = node('span', 'c-l'); l.appendChild(node('b', null, 'Paid customers sent to Google Ads'));
    l.appendChild(node('small', null, seen.length ? 'Google reads it daily' : 'Not set up in Google Ads yet'));
    var r = node('span', 'c-r'); r.appendChild(node('span', 'c-tag ' + (seen.length ? 'is-good' : 'is-warn'), seen.length ? 'On' : 'To set up')); r.appendChild(node('span', 'c-chev', '›'));
    s.appendChild(l); s.appendChild(r); d.appendChild(s);
    var body = node('div', 'ag-body');
    feeds.forEach(function (f) {
      body.appendChild(node('span', 'c-label', BRAND[f.site] || f.site));
      body.appendChild(node('small', 'c-sub', (f.lastFetched ? 'Last read ' + new Date(f.lastFetched).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not read yet') + ', ' + f.paid + ' paid in the last 90 days'));
      if (!f.url) { body.appendChild(node('small', 'c-sub', 'Needs SESSION_SECRET in Vercel.')); return; }
      body.appendChild(node('small', 'ag-link', f.url));
      var c = node('button', 'btn', 'Copy address'); c.type = 'button';
      c.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(f.url).then(function () { c.textContent = 'Copied'; }); });
      body.appendChild(c);
    });
    var how = node('ol', 'ag-steps');
    ['Google Ads: Goals, Conversions, New, Import, Other data sources, Track conversions from clicks. Name it Paid job, value: use different values.',
      'Goals, Uploads, Schedules, New, HTTPS: paste the address, daily.'].forEach(function (t) { how.appendChild(node('li', null, t)); });
    body.appendChild(how);
    d.appendChild(body);
    return d;
  }

  async function load() {
    var box = document.getElementById('tab-growth');
    var d;
    try { d = await U.get('/api/admin/pay?view=growth'); } catch (e) { box.textContent = 'Growth is for the owners.'; return; }
    loaded = true; box.textContent = '';
    var sec = function (title) { var s = node('section', 'mn-sec'); s.appendChild(node('h2', null, title)); box.appendChild(s); return s; };
    var tile = function (into, label, value, sub, cls) { var t = node('div', 'mn-tile' + (cls ? ' ' + cls : '')); t.appendChild(node('small', null, label)); t.appendChild(node('b', null, value)); if (sub) t.appendChild(node('span', null, sub)); into.appendChild(t); };

    /* Google Ads, with the period picked by pill: this month, last month, the year. */
    var ads = sec('Google Ads');
    var pills = node('div', 'c-seg'), body = node('div');
    ads.appendChild(pills); ads.appendChild(body);
    var show = function (key) {
      pills.querySelectorAll('button').forEach(function (p) { p.setAttribute('aria-pressed', String(p.dataset.k === key)); });
      var a = d.googleAds[key], t = node('div', 'mn-tiles'); body.textContent = '';
      tile(t, 'Spent', money(a.spend));
      tile(t, 'Enquiries', String(a.enquiries), a.perEnquiry !== null ? money(a.perEnquiry) + ' each' : '');
      tile(t, 'Booked', String(a.booked), a.perBooked !== null ? money(a.perBooked) + ' each' : '');
      tile(t, 'Paid', money(a.money), a.back !== null ? '£' + a.back.toFixed(2) + ' back per £1' : '', a.back !== null && a.back < 1 ? 'is-bad' : '');
      body.appendChild(t);
      if (!a.spend) body.appendChild(node('p', 'mn-say', 'Log the spend on Money (Add cost, Google Ads) to see the cost per booking.'));
    };
    [['month', 'This month'], ['last', 'Last month'], ['year', 'This year']].forEach(function (k) {
      var b = node('button', null, k[1]); b.type = 'button'; b.dataset.k = k[0]; b.addEventListener('click', function () { show(k[0]); }); pills.appendChild(b);
    });
    show('last');
    ads.appendChild(feedFold(d.adsFeed || []));

    /* Estate agents, one brand at a time (company-agents.js). */
    if (global.DSAGENTS) global.DSAGENTS.mount(box);

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

    /* The booking form step by step, last 30 days: who reached each step and how many left there. */
    var fs = sec('Booking form, last 30 days');
    var form = d.form || { steps: [], sent: 0 };
    var rungs = form.steps.map(function (x) { return ['Step ' + x.step, x.n]; }).concat([['Sent', form.sent]]);
    if (!form.steps.length) fs.appendChild(node('p', 'mn-say', 'None yet.'));
    else {
      var top = rungs[0][1] || 1;
      rungs.forEach(function (r, i) {
        var nextN = i + 1 < rungs.length ? rungs[i + 1][1] : null, left = nextN === null ? 0 : Math.max(0, r[1] - nextN);
        var row = node('div', 'mn-cost' + (left && r[1] && left / r[1] >= 0.4 ? ' is-bad' : ''));
        row.appendChild(node('span', null, r[0] + ': ' + r[1] + (left ? ', ' + left + ' left here (' + pc(left, r[1]) + ')' : '')));
        row.appendChild(node('b', null, pc(r[1], top)));
        var bar = node('div', 'mn-bar mn-bar--thin'), fill = node('i'); fill.style.width = Math.round(100 * r[1] / top) + '%'; bar.appendChild(fill); row.appendChild(bar);
        fs.appendChild(row);
      });
    }

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
