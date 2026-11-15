/* Company, Money (the owners' plan, 15 Nov 2026): money in, costs and profit
   for the period; the tax pot against corporation tax worked out on real
   profit; the VAT threshold; ways to lower this year's tax; and the expenses
   log with receipts. Figures from lib/company-money.js. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var el = function (id) { return document.getElementById(id); };
  var money = function (p) { var n = Number(p) || 0; return (n < 0 ? '−' : '') + '£' + (Math.abs(n) / 100).toLocaleString('en-GB', { minimumFractionDigits: Math.abs(n) % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  var month = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  var shift = function (months) { var d = new Date(today.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); };
  var yearStart = function () { var y = Number(today.slice(0, 4)); return (Number(today.slice(5, 7)) === 12 ? y : y - 1) + '-12-01'; };
  var RANGES = [['month', 'This month', function () { return [shift(0), '']; }], ['last', 'Last month', function () { var e = new Date(shift(0) + 'T12:00:00Z'); e.setUTCDate(0); return [shift(-1), e.toISOString().slice(0, 10)]; }],
    ['year', 'This year', function () { return [yearStart(), '']; }], ['12', 'Last 12 months', function () { return [shift(-11), '']; }]];
  var state = { range: 'year', data: null, loaded: false };

  (global.DSCOTABS = global.DSCOTABS || {}).money = function () { if (!state.loaded) load(); };

  async function load() {
    var r = RANGES.filter(function (x) { return x[0] === state.range; })[0][2]();
    try { state.data = await U.get('/api/admin/pay?view=money&from=' + r[0] + (r[1] ? '&to=' + r[1] : '')); } catch (e) { el('tab-money').textContent = 'Money is for the owners.'; return; }
    state.loaded = true; draw();
  }

  function tile(label, value, sub, cls) { var t = node('div', 'mn-tile' + (cls ? ' ' + cls : '')); t.appendChild(node('small', null, label)); t.appendChild(node('b', null, value)); if (sub) t.appendChild(node('span', null, sub)); return t; }
  function section(title) { var s = node('section', 'mn-sec'); s.appendChild(node('h2', null, title)); el('tab-money').appendChild(s); return s; }

  function draw() {
    var d = state.data, box = el('tab-money'); box.textContent = '';
    var pills = node('div', 'pills pay-range');
    RANGES.forEach(function (r) { var b = node('button', 'pill', r[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(state.range === r[0])); b.addEventListener('click', function () { state.range = r[0]; load(); }); pills.appendChild(b); });
    box.appendChild(pills);
    var p = d.period, tiles = node('div', 'mn-tiles');
    tiles.appendChild(tile('Money in', money(p.in), p.surveys + ' survey' + (p.surveys === 1 ? '' : 's') + ' paid in full'));
    tiles.appendChild(tile('Costs', money(p.cost)));
    tiles.appendChild(tile('Profit', money(p.profit), p.in ? Math.round(100 * p.profit / p.in) + '% of money in' : '', p.profit < 0 ? 'is-bad' : ''));
    tiles.appendChild(tile('Corp tax this year', money(d.tax.estimate), 'on ' + money(d.tax.profit) + ' profit since ' + day(d.tax.yearFrom)));
    box.appendChild(tiles);

    /* Tax: what has been set aside against what the real profit says is due. */
    var t = section('Tax pot');
    var row = node('div', 'mn-tiles');
    row.appendChild(tile('Set aside this year', money(d.tax.setAside)));
    row.appendChild(tile('Estimated tax due', money(d.tax.estimate), Math.round(d.tax.rate * 1000) / 10 + '% on the next pound'));
    row.appendChild(tile('Moved to tax savings', money(d.tax.inPot)));
    t.appendChild(row);
    t.appendChild(node('p', 'mn-say' + (d.tax.gap < 0 ? ' is-bad' : ''), d.tax.gap >= 0 ? money(d.tax.gap) + ' more set aside than the estimate. Comfortable.' : 'Set aside is ' + money(-d.tax.gap) + ' short of the estimate. Top the tax pot up.'));

    /* VAT: the rolling 12 months against the threshold. */
    var v = section('VAT threshold');
    var pc = Math.min(100, Math.round(100 * d.vat.rolling / d.vat.limit));
    var bar = node('div', 'mn-bar'), fill = node('i'); fill.style.width = pc + '%'; if (pc >= 80) bar.classList.add('is-near'); bar.appendChild(fill); v.appendChild(bar);
    v.appendChild(node('p', 'mn-say', money(d.vat.rolling) + ' of ' + money(d.vat.limit) + ' in the last 12 months (' + pc + '%).'));
    v.appendChild(node('p', 'mn-say' + (pc >= 80 ? ' is-bad' : ''), d.vat.crossOn ? 'At ' + money(d.vat.perMonth) + ' a month you would reach it around ' + month(d.vat.crossOn) + '. Plan prices with your accountant before then.' : 'Not enough recent work to project.'));

    /* Costs: every line, biggest first, with the expenses log beneath. */
    var c = section('Costs');
    var max = Math.max.apply(null, p.costs.map(function (x) { return x.pence; }).concat([1]));
    if (!p.costs.length) c.appendChild(node('p', 'mn-say', 'None in this period.'));
    p.costs.slice().sort(function (a, b) { return b.pence - a.pence; }).forEach(function (x) {
      var r2 = node('div', 'mn-cost'); r2.appendChild(node('span', null, x.name)); r2.appendChild(node('b', null, money(x.pence)));
      var b2 = node('div', 'mn-bar mn-bar--thin'), f2 = node('i'); f2.style.width = Math.round(100 * x.pence / max) + '%'; b2.appendChild(f2); r2.appendChild(b2); c.appendChild(r2);
    });
    expenseForm(c);
    d.expenses.forEach(function (e) {
      var r3 = node('div', 'pay-line is-out');
      var left = node('div'); left.appendChild(node('span', 'pay-line-what', e.category + (e.what ? ': ' + e.what : ''))); left.appendChild(node('small', null, day(e.day) + (e.by ? ', by ' + e.by : '')));
      var acts = node('span', 'mn-acts'); left.appendChild(acts);
      if (e.receipt) { var a = node('a', 'pay-rm', 'Receipt'); a.href = '/api/admin/attachment?path=' + encodeURIComponent(e.receipt); a.dataset.view = '1'; a.dataset.name = 'Receipt'; acts.appendChild(a); }
      var rm = node('button', 'pay-rm', 'Remove'); rm.type = 'button';
      rm.addEventListener('click', async function () { if (!global.confirm('Remove this expense of ' + money(e.pence) + '?')) return; await U.send('/api/admin/pay', { op: 'unexpense', id: e.id }); load(); });
      acts.appendChild(rm);
      r3.appendChild(left); var amt = node('div', 'pay-line-amt'); amt.appendChild(node('b', null, money(e.pence))); r3.appendChild(amt);
      c.appendChild(r3);
    });

    /* Ways to lower this year's tax, each with what it would save at this year's rate. */
    var w = section('Ways to lower this year\'s tax');
    d.ideas.forEach(function (i) {
      var k = node('details', 'mn-idea'); var s = node('summary'); s.appendChild(node('span', null, i.title)); s.appendChild(node('b', null, 'saves ' + money(i.saves) + ' on ' + money(i.example))); k.appendChild(s);
      k.appendChild(node('p', null, i.says)); w.appendChild(k);
    });
    w.appendChild(node('p', 'mn-say', 'Prompts to check with your accountant, not advice.'));
  }

  /* A cost with its receipt photo, straight to storage like the booking form's photos. */
  function expenseForm(into) {
    var f = node('form', 'pay-form');
    var amt = document.createElement('input'); amt.type = 'number'; amt.step = '0.01'; amt.min = '0.01'; amt.inputMode = 'decimal'; amt.placeholder = 'Amount, £'; amt.setAttribute('aria-label', 'Amount in pounds');
    var on = document.createElement('input'); on.type = 'date'; on.value = today; on.setAttribute('aria-label', 'Date');
    var cat = document.createElement('select'); cat.setAttribute('aria-label', 'What for');
    state.data.categories.forEach(function (x) { var o = document.createElement('option'); o.textContent = x; cat.appendChild(o); });
    var what = document.createElement('input'); what.type = 'text'; what.placeholder = 'What (optional)'; what.setAttribute('aria-label', 'What');
    var file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*,application/pdf'; file.setAttribute('aria-label', 'Receipt');
    var go = node('button', 'btn btn--primary', 'Add cost'); go.type = 'submit';
    var msg = node('p', 'panel-note');
    [amt, on, cat, what, file, go, msg].forEach(function (x) { f.appendChild(x); });
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var pence = Math.round(Number(amt.value) * 100);
      if (!(pence > 0)) { msg.textContent = 'Enter the amount.'; return; }
      go.disabled = true; msg.textContent = '';
      var receipt = null;
      try { if (file.files && file.files[0]) receipt = await upload(file.files[0]); } catch (er) { msg.textContent = 'The receipt did not upload. Saved without it.'; }
      var r = await U.send('/api/admin/pay', { op: 'expense', pence: pence, day: on.value, category: cat.value, what: what.value, receipt: receipt });
      go.disabled = false;
      if (!r.ok) { msg.textContent = (r.data && r.data.error) || 'Not saved.'; return; }
      load();
    });
    into.appendChild(f);
  }
  function upload(file) {
    return fetch('/api/upload?mode=presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type }) })
      .then(function (r) { return r.json(); }).then(function (s) {
        if (s.ok && s.url) return fetch(s.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }).then(function (r) { if (!r.ok) throw new Error(); return s.path; });
        return fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
          .then(function (r) { return r.json(); }).then(function (x) { if (!x.ok || !x.path) throw new Error(); return x.path; });
      });
  }
})(window);
