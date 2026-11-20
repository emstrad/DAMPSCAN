/* Company, Bank check (the owners' plan, 15 Nov 2026; reconciling like Xero,
   the owner's ask, 16 Nov 2026): a Tide statement, any dates, put beside the
   books (lib/tide-check.js). Each line left to do is a card: the bank line on
   one side, its likeliest match on the other, and OK. A transfer with the
   customer's own reference is reconciled already (shown, with Undo); another
   is matched to a survey in one tap or found from the list; a payment out
   becomes a cost or a payment on Pay. After each OK the same file is checked
   again, so the list only ever gets shorter. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var box = function () { return document.getElementById('tab-bank'); };
  var money = function (p) { var n = Math.abs(Number(p) || 0); return '£' + (n / 100).toLocaleString('en-GB', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  /* Where an unlogged payment out can go: a cost, or a payment to someone on Pay. */
  var COSTS = ['Google Ads', 'Bank fees', 'Software', 'Equipment', 'Insurance', 'Vehicle and fuel', 'Mileage', 'Use of home', 'Phone', 'Accountant', 'Other'];
  var PAYS = [['scott', 'Salary', 'Scott: salary'], ['scott', 'Dividend', 'Scott: dividend'], ['tom', 'Salary', 'Tom: salary'], ['tom', 'Dividend', 'Tom: dividend'],
    ['ben', 'Bank transfer', 'Ben'], ['ronnie', 'Bank transfer', 'Ronnie'], ['tax', 'Moved to tax savings', 'Tax savings'], ['tax', 'Paid to HMRC', 'Paid to HMRC']];
  var state = { text: null, name: '', data: null, error: '', drawn: false, busy: false, skipped: [] };

  (global.DSCOTABS = global.DSCOTABS || {}).bank = function () { if (!state.drawn) draw(); };

  function draw() {
    state.drawn = true;
    var b = box(); b.textContent = '';
    var top = node('div', 'rec-top');
    var pick = node('label', 'btn ' + (state.text ? 'btn--ghost' : 'btn--primary') + ' tide-pick');
    var file = document.createElement('input'); file.type = 'file'; file.accept = '.csv,text/csv'; file.className = 'sr-only';
    pick.appendChild(document.createTextNode(state.text ? 'Upload another statement' : 'Upload a Tide statement (CSV)')); pick.appendChild(file);
    top.appendChild(pick);
    top.appendChild(node('p', 'mn-say', state.name || 'Tide: Transactions, filter by date, Export, CSV. Any dates, as often as you like.'));
    b.appendChild(top);
    var msg = node('p', 'mn-say is-bad', state.error); b.appendChild(msg);
    file.addEventListener('change', async function () {
      var f = file.files && file.files[0]; if (!f) return;
      state.text = await f.text(); state.name = f.name; run(msg);
    });
    if (state.data) result(b, state.data);
  }

  async function run(msg) {
    if (msg) msg.textContent = 'Reconciling...';
    var res = await fetch('/api/admin/pay?op=tide', { method: 'POST', headers: { 'Content-Type': 'text/csv', Accept: 'application/json' }, body: state.text });
    if (res.status === 401) { global.location.replace('/staff'); return; }
    var data = await res.json().catch(function () { return null; });
    state.error = !res.ok || !data || !data.ok ? (data && data.error) || 'The check failed.' : '';
    state.data = state.error ? null : data; draw();
  }

  /* One action, then the same file again: what was done drops off the list. */
  async function act(btn, body) {
    if (state.busy) return; state.busy = true; btn.disabled = true; var was = btn.textContent; btn.textContent = '...';
    var r = await U.send('/api/admin/pay', body).catch(function () { return { ok: false }; });
    state.busy = false;
    if (!r.ok) { btn.disabled = false; btn.textContent = was; global.alert((r.data && r.data.error) || 'That did not save. Try again.'); return; }
    run();
  }

  /* The bank line, as Tide shows it: the amount big, who from, the date and reference. */
  function bankSide(l) {
    var s = node('div', 'rec-bank');
    s.appendChild(node('span', 'c-label', l.pence < 0 ? 'Money out' : 'Money in'));
    s.appendChild(node('b', 'rec-amt ' + (l.pence < 0 ? 'is-out' : 'is-in'), (l.pence < 0 ? '−' : '+') + money(l.pence)));
    s.appendChild(node('span', 'rec-what', l.what || 'No description'));
    s.appendChild(node('small', null, day(l.day) + (l.reference ? ' · ref ' + l.reference : '')));
    return s;
  }
  function card(l, matchSide) {
    var c = node('div', 'rec-card'); c.appendChild(bankSide(l));
    var m = node('div', 'rec-match'); matchSide(m); c.appendChild(m);
    return c;
  }
  function okBtn(text) { var b = node('button', 'c-ok rec-ok', text || 'OK'); b.type = 'button'; return b; }
  var line = function (l) { return { ref: l.ref, day: l.day, pence: l.pence, reference: l.reference, what: l.what }; };

  /* Every survey still owed, best guesses first, as "Kim Lee, ME19 6AB · owes £147.50". */
  function surveyPicker(l, open, first) {
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'Which survey it pays for');
    var none = document.createElement('option'); none.value = ''; none.textContent = 'Find the survey...'; sel.appendChild(none);
    var lead = (l.maybe || []).map(function (x) { return x.id; }).concat(first ? [first] : []);
    var list = open.slice().sort(function (a, b) { return (lead.indexOf(b.id) !== -1) - (lead.indexOf(a.id) !== -1); });
    list.forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.name + (s.postcode ? ', ' + s.postcode : '') + ' · owes ' + money(s.owedPence) + ' · ' + s.ref; sel.appendChild(o); });
    return sel;
  }

  /* A folded line: a count at the right, the list beneath when opened. */
  function foldRow(b, title, sub, count, tagCls, fill, open) {
    var r = node('button', 'c-row'); r.type = 'button'; r.setAttribute('aria-expanded', String(Boolean(open)));
    var l = node('span', 'c-l'); l.appendChild(node('b', null, title)); if (sub) l.appendChild(node('small', null, sub));
    var rr = node('span', 'c-r'); rr.appendChild(node('span', 'c-tag ' + (tagCls || ''), String(count))); rr.appendChild(node('span', 'c-chev', '›'));
    r.appendChild(l); r.appendChild(rr);
    var f = node('div', 'c-fold'); f.hidden = !open; fill(f);
    r.addEventListener('click', function () { f.hidden = !f.hidden; r.setAttribute('aria-expanded', String(!f.hidden)); });
    b.appendChild(r); b.appendChild(f);
  }

  /* One line at a time (the owner's calmer screens, 16 Nov 2026): the one decision on screen,
     OK or Skip, the bar filling; everything settled folds into a line each underneath. */
  function result(b, d) {
    var settledN = d.totals.matched, all = d.totals.lines;
    var todo = d.lines.filter(function (l) { return ['suggest', 'unknown', 'missing'].indexOf(l.status) !== -1; });
    todo.sort(function (a, c) { return (state.skipped.indexOf(a.ref) !== -1) - (state.skipped.indexOf(c.ref) !== -1); });
    var head = node('div', 'rec-head');
    var top = node('div', 'rec-headline');
    top.appendChild(node('b', null, todo.length ? settledN + ' of ' + all + ' done' : 'All ' + all + ' lines reconciled'));
    top.appendChild(node('span', 'c-sub', todo.length ? todo.length + ' to go' : 'The books match Tide'));
    head.appendChild(top);
    var bar = node('div', 'rec-bar'); var fill = node('span'); fill.style.width = (all ? Math.round(settledN / all * 100) : 100) + '%'; bar.appendChild(fill); head.appendChild(bar);
    head.appendChild(node('small', 'c-sub', day(d.from) + ' to ' + day(d.to) + ' · in ' + money(d.totals.in) + ' · out ' + money(d.totals.out) + (d.totals.pending ? ' · ' + d.totals.pending + ' pending' : '') + (d.unreadable ? ' · ' + d.unreadable + ' unreadable' : '')));
    b.appendChild(head);
    if (todo.length) {
      var l = todo[0];
      var one = l.pence < 0 ? outCard(l) : inCard(l, d.open || []);
      b.appendChild(one);
    }
    var rows = node('div', 'c-rows rec-folds');
    /* Savings moves first, open: the one thing here only a person can say (was it the tax pot?). */
    var sav = d.lines.filter(function (x) { return x.status === 'savings'; });
    if (sav.length) foldRow(rows, 'Moved to or from Tide savings', 'Out ' + money(d.totals.toSavings) + ' · back ' + money(d.totals.fromSavings), sav.length, '', function (f) {
      sav.forEach(function (x) { f.appendChild(card(x, function (m) { savingsSide(m, x); })); });
    }, true);
    var by = function (st) { return d.lines.filter(function (x) { return x.status === st; }); };
    /* Stripe paying out the card payments less its fees: each payment is already on its survey. */
    var pays = by('payout');
    if (pays.length) foldRow(rows, 'From Stripe', 'Card payments less fees · nothing to match', pays.length, 'is-good', function (f) {
      pays.forEach(function (x) {
        f.appendChild(card(x, function (m) {
          m.appendChild(node('span', 'c-tag is-good', 'Stripe payout'));
          var p = x.payout;
          if (p) m.appendChild(node('small', 'c-sub', p.payments + ' card payment' + (p.payments === 1 ? '' : 's') + ' ' + money(p.gross) + ' · fees ' + money(p.fees) + (p.refunds ? ' · refunds ' + money(p.refunds) : '')));
        }));
      });
    });
    var refunds = by('refund');
    if (refunds.length) foldRow(rows, 'Refunds', 'Paired with what they gave back', refunds.length, 'is-good', function (f) {
      refunds.forEach(function (x) { f.appendChild(card(x, function (m) { m.appendChild(node('span', 'c-tag', x.pence > 0 ? 'Refund' : 'Refunded')); if (x.pair) m.appendChild(node('small', 'c-sub', (x.pence > 0 ? 'Of ' : 'By ') + money(x.pair.pence) + ' on ' + day(x.pair.day))); })); });
    });
    var waiting = by('pending');
    if (waiting.length) foldRow(rows, 'Pending at Tide', 'Checked once it clears', waiting.length, 'is-warn', function (f) {
      waiting.forEach(function (x) { f.appendChild(card(x, function (m) { m.appendChild(node('span', 'c-tag is-warn', 'Pending')); })); });
    });
    var gone = by('void');
    if (gone.length) foldRow(rows, 'Cancelled or declined', 'No money moved', gone.length, gone.some(function (x) { return x.reversed; }) ? 'is-warn' : '', function (f) {
      gone.forEach(function (x) { f.appendChild(card(x, function (m) {
        if (x.reversed) { x.survey = x.reversed; matched(m, x, 'Reversed: check their payments', false); return; }
        m.appendChild(node('span', 'c-tag', x.state || 'Cancelled'));
      })); });
    });
    var auto = d.lines.filter(function (x) { return x.status === 'auto'; });
    if (auto.length) foldRow(rows, 'Matched for you', 'By their reference', auto.length, 'is-good', function (f) {
      auto.forEach(function (x) { f.appendChild(card(x, function (m) { matched(m, x, x.ticked && x.ticked.indexOf('paid') !== -1 ? 'Paid in full' : x.ticked && x.ticked.length ? 'Deposit paid' : 'Recorded', true); })); });
    });
    if (d.notOnStatement.length) foldRow(rows, 'In the books, not in Tide', 'Cash, a later date, or a mistake', d.notOnStatement.length, 'is-warn', function (f) {
      d.notOnStatement.forEach(function (x) { f.appendChild(card({ day: x.day, pence: -x.pence, what: x.label }, function (m) { m.appendChild(x.refunded ? node('span', 'c-tag is-warn', 'Refunded: remove it') : node('small', 'c-sub', 'No line in this statement')); })); });
    });
    var settled = d.lines.filter(function (x) { return ['matched', 'reconciled'].indexOf(x.status) !== -1; });
    if (settled.length) foldRow(rows, 'Already in the books', null, settled.length, '', function (f) {
      settled.forEach(function (x) {
        f.appendChild(card(x, function (m) {
          if (x.status === 'reconciled') matched(m, x, 'Matched', true);
          else m.appendChild(node('span', 'c-tag', x.survey ? x.survey.name + ' (ticked by hand)' : x.logbook.label));
        }));
      });
    });
    if (rows.childNodes.length) b.appendChild(rows);
  }

  /* A savings move: count it into the tax pot (or out of it) in one tap; left alone it is just savings. */
  function savingsSide(m, l) {
    var out = l.pence < 0;
    m.appendChild(node('span', 'c-tag', out ? 'To savings' : 'From savings'));
    var b = node('button', 'c-quiet', out ? 'Count as tax pot' : 'Taken from tax pot'); b.type = 'button';
    b.addEventListener('click', function () { act(b, { op: 'pay', who: 'tax', how: 'Moved to tax savings', pence: -l.pence, day: l.day, note: out ? 'Tide savings' : 'Back from Tide savings', bankRef: l.ref }); });
    m.appendChild(b);
  }

  /* A matched transfer: who it paid, Open their card, and Undo when this page matched it. */
  function matched(m, l, what, undo) {
    var who = node('button', 'c-link', l.survey.name + (l.survey.postcode ? ', ' + l.survey.postcode : '')); who.type = 'button';
    who.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(l.survey.id, { onChange: function () { run(); } }); });
    m.appendChild(who); m.appendChild(node('span', 'c-tag is-good', what));
    if (undo) { var u = node('button', 'c-link', 'Undo'); u.type = 'button'; u.addEventListener('click', function () { act(u, { op: 'unreconcile', ref: l.ref }); }); m.appendChild(u); }
  }
  /* Skip puts a line to the back of the queue for this file. */
  function skipBtn(l) { var s = node('button', 'c-quiet', 'Skip'); s.type = 'button'; s.addEventListener('click', function () { state.skipped = state.skipped.filter(function (r) { return r !== l.ref; }).concat([l.ref]); draw(); }); return s; }
  function buttons(m, l, ok) { var row = node('div', 'rec-actions'); row.appendChild(skipBtn(l)); row.appendChild(ok); m.appendChild(row); }

  /* Money in: the likeliest survey with OK, or find it in the list. */
  function inCard(l, open) {
    return card(l, function (m) {
      var pickBox = node('div', 'rec-find'), sel = surveyPicker(l, open, l.survey && l.survey.id);
      var ok = okBtn(l.status === 'suggest' ? 'OK, match' : 'Match');
      ok.addEventListener('click', function () { var id = l.status === 'suggest' && pickBox.hidden ? l.survey.id : Number(sel.value); if (!id) { sel.focus(); return; } act(ok, { op: 'reconcile', line: line(l), jobId: id }); });
      if (l.status === 'suggest') {
        m.appendChild(node('span', 'c-label', 'Match to'));
        var who = node('b', 'rec-sugg', l.survey.name + (l.survey.postcode ? ', ' + l.survey.postcode : '')); m.appendChild(who);
        var other = node('button', 'c-link', 'Not them? Find another'); other.type = 'button';
        other.addEventListener('click', function () { pickBox.hidden = false; other.hidden = true; who.classList.add('is-off'); sel.focus(); });
        pickBox.hidden = true; pickBox.appendChild(sel);
        m.appendChild(pickBox); buttons(m, l, ok); m.appendChild(other);
      } else {
        m.appendChild(node('span', 'c-label', 'No clear match: find it'));
        pickBox.appendChild(sel); m.appendChild(pickBox); buttons(m, l, ok);
      }
    });
  }

  /* Money out: a cost or a payment on Pay, the likeliest chosen, then OK. */
  function outCard(l) {
    return card(l, function (m) {
      var sel = document.createElement('select'); sel.setAttribute('aria-label', 'What it was');
      var none = document.createElement('option'); none.value = ''; none.textContent = 'What was it?'; sel.appendChild(none);
      var g1 = document.createElement('optgroup'); g1.label = 'A cost';
      COSTS.forEach(function (c) { var o = document.createElement('option'); o.value = 'cost:' + c; o.textContent = c; g1.appendChild(o); });
      var g2 = document.createElement('optgroup'); g2.label = 'Paid to';
      PAYS.forEach(function (p) { var o = document.createElement('option'); o.value = 'pay:' + p[0] + ':' + p[1]; o.textContent = p[2]; g2.appendChild(o); });
      sel.appendChild(g1); sel.appendChild(g2);
      if (l.guess) sel.value = l.guess;
      m.appendChild(node('span', 'c-label', l.guess ? 'Looks like' : 'Record as'));
      var ok = okBtn('OK, record it');
      ok.addEventListener('click', function () {
        if (!sel.value) { sel.focus(); return; }
        var v = sel.value.split(':'), pence = -l.pence;
        act(ok, v[0] === 'cost' ? { op: 'expense', pence: pence, day: l.day, category: v[1], what: l.what, bankRef: l.ref }
          : { op: 'pay', who: v[1], how: v[2], pence: pence, day: l.day, note: l.what, bankRef: l.ref });
      });
      var row = node('div', 'rec-find'); row.appendChild(sel); m.appendChild(row); buttons(m, l, ok);
    });
  }
})(window);
