/* Company, Bank check (the owners' plan, 15 Nov 2026): the month's Tide
   statement checked against the logbook (lib/tide-check.js). What needs
   putting right comes first; a payment out nobody logged is added as a cost or
   a payment on Pay in one tap, remembering its line, then the check runs again
   on the same file. Customer money is only pointed at their card, never ticked
   from here. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var box = function () { return document.getElementById('tab-bank'); };
  var money = function (p) { var n = Math.abs(Number(p) || 0); return '£' + (n / 100).toLocaleString('en-GB', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  /* Where an unlogged payment out can go: a cost, or a payment to someone on Pay. */
  var COSTS = ['Google Ads', 'Bank fees', 'Software', 'Equipment', 'Insurance', 'Vehicle and fuel', 'Phone', 'Accountant', 'Other'];
  var PAYS = [['scott', 'Salary', 'Scott: salary'], ['scott', 'Dividend', 'Scott: dividend'], ['tom', 'Salary', 'Tom: salary'], ['tom', 'Dividend', 'Tom: dividend'],
    ['ben', 'Bank transfer', 'Ben'], ['ronnie', 'Bank transfer', 'Ronnie'], ['tax', 'Moved to tax savings', 'Tax savings'], ['tax', 'Paid to HMRC', 'Paid to HMRC']];
  var state = { text: null, name: '', data: null, error: '', drawn: false };

  (global.DSCOTABS = global.DSCOTABS || {}).bank = function () { if (!state.drawn) draw(); };

  function draw() {
    state.drawn = true;
    var b = box(); b.textContent = '';
    var pick = node('label', 'btn btn--primary tide-pick');
    var file = document.createElement('input'); file.type = 'file'; file.accept = '.csv,text/csv'; file.className = 'sr-only';
    pick.appendChild(document.createTextNode(state.text ? 'Check another statement' : 'Choose the Tide statement (CSV)')); pick.appendChild(file);
    b.appendChild(pick);
    b.appendChild(node('p', 'mn-say', state.name ? state.name : 'Tide: Transactions, Export, CSV, one month at a time.'));
    var msg = node('p', 'mn-say is-bad', state.error); b.appendChild(msg);
    file.addEventListener('change', async function () {
      var f = file.files && file.files[0]; if (!f) return;
      state.text = await f.text(); state.name = f.name; run(msg);
    });
    if (state.data) result(b, state.data);
  }

  async function run(msg) {
    if (msg) msg.textContent = 'Checking...';
    var res = await fetch('/api/admin/pay?op=tide', { method: 'POST', headers: { 'Content-Type': 'text/csv', Accept: 'application/json' }, body: state.text });
    if (res.status === 401) { global.location.replace('/staff'); return; }
    var data = await res.json().catch(function () { return null; });
    state.error = !res.ok || !data || !data.ok ? (data && data.error) || 'The check failed.' : '';
    state.data = state.error ? null : data; draw();
  }

  function row(l, right) {
    var r = node('div', 'tide-row');
    var left = node('div', 'tide-what');
    left.appendChild(node('b', null, (l.pence < 0 ? '−' : '') + money(l.pence)));
    left.appendChild(node('span', null, l.what || l.label || ''));
    left.appendChild(node('small', null, day(l.day) + (l.reference ? ', ref ' + l.reference : '')));
    r.appendChild(left);
    if (right) r.appendChild(right);
    return r;
  }
  function openCard(id) { var a = node('button', 'tide-chip', 'Open'); a.type = 'button'; a.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(id, { onChange: function () { run(); } }); }); return a; }

  function result(b, d) {
    var tiles = node('div', 'mn-tiles');
    [['Money in', money(d.totals.in)], ['Money out', money(d.totals.out)], ['Matched', d.totals.matched + ' of ' + d.totals.lines]].forEach(function (t) {
      var x = node('div', 'mn-tile'); x.appendChild(node('small', null, t[0])); x.appendChild(node('b', null, t[1])); tiles.appendChild(x);
    });
    b.appendChild(tiles);
    b.appendChild(node('p', 'mn-say', day(d.from) + ' to ' + day(d.to) + (d.unreadable ? ', ' + d.unreadable + ' line' + (d.unreadable === 1 ? '' : 's') + ' unreadable' : '')));
    var missing = d.lines.filter(function (l) { return l.status === 'missing'; });
    var untick = d.lines.filter(function (l) { return l.status === 'untick'; });
    var unknown = d.lines.filter(function (l) { return l.status === 'unknown'; });
    var sec = function (title) { var s = node('section', 'mn-sec'); s.appendChild(node('h2', null, title)); b.appendChild(s); return s; };
    if (!missing.length && !untick.length && !unknown.length && !d.notOnStatement.length) b.appendChild(node('p', 'mn-say tide-ok', 'All matched.'));
    if (missing.length) { var m = sec('Paid out, not in the logbook (' + missing.length + ')'); missing.forEach(function (l) { m.appendChild(row(l, fix(l))); }); }
    if (untick.length) { var u = sec('Paid in, not ticked on their card (' + untick.length + ')'); untick.forEach(function (l) { u.appendChild(row(Object.assign({}, l, { what: l.survey.name + (l.survey.postcode ? ', ' + l.survey.postcode : '') }), openCard(l.survey.id))); }); }
    if (unknown.length) {
      var k = sec('Paid in, not placed (' + unknown.length + ')');
      unknown.forEach(function (l) {
        var chips = node('div', 'tide-maybe');
        (l.maybe || []).forEach(function (s) { var c = openCard(s.id); c.textContent = s.name; chips.appendChild(c); });
        k.appendChild(row(l, chips));
      });
    }
    if (d.notOnStatement.length) { var n = sec('In the logbook, not in Tide (' + d.notOnStatement.length + ')'); d.notOnStatement.forEach(function (x) { n.appendChild(row(Object.assign({}, x, { pence: -x.pence, what: x.label }))); }); }
    var done = d.lines.filter(function (l) { return l.status === 'matched' || l.status === 'payout'; });
    if (done.length) {
      var f = node('details', 'pay-split'); f.appendChild(node('summary', null, 'Matched (' + done.length + ')'));
      done.forEach(function (l) { f.appendChild(row(l, node('small', 'tide-to', l.status === 'payout' ? 'Card payout' : l.survey ? l.survey.name : l.logbook.label))); });
      b.appendChild(f);
    }
  }

  /* One select (a cost or a payment on Pay, the likeliest chosen) and Add. */
  function fix(l) {
    var wrap = node('div', 'tide-fix');
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'What it was');
    var none = document.createElement('option'); none.value = ''; none.textContent = 'What was it?'; sel.appendChild(none);
    var g1 = document.createElement('optgroup'); g1.label = 'A cost';
    COSTS.forEach(function (c) { var o = document.createElement('option'); o.value = 'cost:' + c; o.textContent = c; g1.appendChild(o); });
    var g2 = document.createElement('optgroup'); g2.label = 'Paid to';
    PAYS.forEach(function (p) { var o = document.createElement('option'); o.value = 'pay:' + p[0] + ':' + p[1]; o.textContent = p[2]; g2.appendChild(o); });
    sel.appendChild(g1); sel.appendChild(g2);
    if (l.guess) sel.value = l.guess;
    var go = node('button', 'btn btn--primary', 'Add'); go.type = 'button';
    go.addEventListener('click', async function () {
      if (!sel.value) { sel.focus(); return; }
      var v = sel.value.split(':'), pence = -l.pence;
      var body = v[0] === 'cost' ? { op: 'expense', pence: pence, day: l.day, category: v[1], what: l.what, bankRef: l.ref }
        : { op: 'pay', who: v[1], how: v[2], pence: pence, day: l.day, note: l.what, bankRef: l.ref };
      go.disabled = true;
      var r = await U.send('/api/admin/pay', body);
      if (!r.ok) { go.disabled = false; go.textContent = 'Try again'; return; }
      run();
    });
    wrap.appendChild(sel); wrap.appendChild(go);
    return wrap;
  }
})(window);
