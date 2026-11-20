/* Company, Accountant (the owner, 20 Nov 2026): what to put right first, every
   filing and payment date with the days left, the company year's figures, the
   year's records to download, and the questions to take to the accountant.
   Figures from lib/accountant.js; each check opens the tab where it is put right. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var money = function (p) { var n = Number(p) || 0; return (n < 0 ? '−' : '') + '£' + Math.round(Math.abs(n) / 100).toLocaleString('en-GB'); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var loaded = false;

  (global.DSCOTABS = global.DSCOTABS || {}).accountant = function () { if (!loaded) load(); };

  function rowsOf(list) { var r = node('div', 'c-rows'); list.forEach(function (x) { r.appendChild(x); }); return r; }
  function row(label, sub, figure, cls, onTap) {
    var b = node(onTap ? 'button' : 'div', 'c-row' + (cls ? ' ' + cls : '')); if (onTap) { b.type = 'button'; b.addEventListener('click', onTap); }
    var l = node('span', 'c-l'); l.appendChild(node('b', null, label)); if (sub) l.appendChild(node('small', null, sub));
    var r = node('span', 'c-r'); if (figure) r.appendChild(node('span', 'c-amt', figure)); if (onTap) r.appendChild(node('span', 'c-chev', '›'));
    b.appendChild(l); b.appendChild(r); return b;
  }
  var when = function (n) { return n < 0 ? Math.abs(n) + ' days ago' : n === 0 ? 'today' : n < 62 ? 'in ' + n + ' days' : 'in ' + Math.round(n / 30.44) + ' months'; };

  async function load() {
    var box = document.getElementById('tab-accountant'), d;
    try { d = await U.get('/api/admin/pay?view=accountant'); } catch (e) { box.textContent = 'This is for the owners.'; return; }
    loaded = true; box.textContent = '';
    var sec = function (title) { var s = node('section', 'mn-sec'); s.appendChild(node('h2', null, title)); box.appendChild(s); return s; };

    var c = sec('Put right first');
    if (!d.checks.length) c.appendChild(node('p', 'mn-say tide-ok', 'All in order.'));
    else c.appendChild(rowsOf(d.checks.map(function (x) {
      return row(x.text, null, null, x.bad ? 'is-bad' : '', function () { if (global.DSCOSHOW) global.DSCOSHOW(x.tab); if (x.who && global.DSCOPAY) global.DSCOPAY.open(x.who); });
    })));

    var dt = sec('Key dates');
    dt.appendChild(rowsOf(d.dates.map(function (x) { return row(x.what, when(x.days), day(x.day), x.days >= 0 && x.days <= 60 ? 'is-bad' : ''); })));

    var f = d.figures, y = sec('Company year to ' + day(d.year.to));
    var t = node('div', 'mn-tiles');
    var tile = function (label, value, sub) { var k = node('div', 'mn-tile'); k.appendChild(node('small', null, label)); k.appendChild(node('b', null, value)); if (sub) k.appendChild(node('span', null, sub)); t.appendChild(k); };
    tile('Money in', money(f.in), f.surveys + ' surveys since ' + day(d.year.from));
    tile('Profit', money(f.profit), 'after ' + money(f.cost) + ' costs');
    tile('Corp tax estimate', money(f.tax));
    tile('Dividends paid', money(f.dividends), money(Math.max(0, f.afterTax - f.dividends)) + ' more available');
    y.appendChild(t);

    var dl = sec('For the accountant');
    var links = node('div', 'acc-dl');
    var link = function (label, from, to) { var a = node('a', 'btn btn--ghost', label); a.href = '/api/admin/pay?view=accounts&from=' + from + (to ? '&to=' + to : ''); a.setAttribute('download', ''); links.appendChild(a); };
    link('Download the company year', d.year.from, '');
    var m0 = d.today.slice(0, 8) + '01', e = new Date(m0 + 'T12:00:00Z'); e.setUTCDate(0); var lastEnd = e.toISOString().slice(0, 10);
    if (lastEnd >= d.year.from) link('Download last month', lastEnd.slice(0, 8) + '01', lastEnd);
    dl.appendChild(links);
    dl.appendChild(rowsOf(d.questions.map(function (q) { return row(q); })));
  }
})(window);
