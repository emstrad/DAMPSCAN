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
  var COSTS = ['Google Ads', 'Bank fees', 'Software', 'Equipment', 'Insurance', 'Vehicle and fuel', 'Phone', 'Accountant', 'Other'];
  var PAYS = [['scott', 'Salary', 'Scott: salary'], ['scott', 'Dividend', 'Scott: dividend'], ['tom', 'Salary', 'Tom: salary'], ['tom', 'Dividend', 'Tom: dividend'],
    ['ben', 'Bank transfer', 'Ben'], ['ronnie', 'Bank transfer', 'Ronnie'], ['tax', 'Moved to tax savings', 'Tax savings'], ['tax', 'Paid to HMRC', 'Paid to HMRC']];
  var state = { text: null, name: '', data: null, error: '', drawn: false, busy: false };

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

  /* The bank line, as Tide shows it. */
  function bankSide(l) {
    var s = node('div', 'rec-bank');
    var amt = node('b', 'rec-amt ' + (l.pence < 0 ? 'is-out' : 'is-in'), (l.pence < 0 ? 'Spent ' : 'Received ') + money(l.pence));
    s.appendChild(amt);
    s.appendChild(node('span', 'rec-what', l.what || 'No description'));
    s.appendChild(node('small', null, day(l.day) + (l.reference ? ' · ref ' + l.reference : '')));
    return s;
  }
  function card(l, matchSide) {
    var c = node('div', 'rec-card'); c.appendChild(bankSide(l));
    var m = node('div', 'rec-match'); matchSide(m); c.appendChild(m);
    return c;
  }
  function okBtn(text) { var b = node('button', 'btn btn--primary rec-ok', text || 'OK'); b.type = 'button'; return b; }
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

  function result(b, d) {
    var done = d.totals.matched, all = d.totals.lines;
    var head = node('div', 'rec-head');
    var bar = node('div', 'rec-bar'); var fill = node('span'); fill.style.width = (all ? Math.round(done / all * 100) : 100) + '%'; bar.appendChild(fill);
    head.appendChild(node('b', null, done === all ? 'All ' + all + ' lines reconciled' : done + ' of ' + all + ' lines reconciled'));
    head.appendChild(bar);
    head.appendChild(node('small', null, day(d.from) + ' to ' + day(d.to) + ' · in ' + money(d.totals.in) + ' · out ' + money(d.totals.out) + (d.unreadable ? ' · ' + d.unreadable + ' unreadable' : '')));
    b.appendChild(head);
    var sec = function (title, cls) { var s = node('section', 'mn-sec ' + (cls || '')); s.appendChild(node('h2', null, title)); b.appendChild(s); return s; };
    var todo = d.lines.filter(function (l) { return ['suggest', 'unknown', 'missing'].indexOf(l.status) !== -1; });
    if (todo.length) {
      var t = sec('To reconcile (' + todo.length + ')');
      todo.forEach(function (l) { t.appendChild(l.pence < 0 ? outCard(l) : inCard(l, d.open || [])); });
    }
    if (d.notOnStatement.length) {
      var n = sec('In the books, not in Tide (' + d.notOnStatement.length + ')');
      d.notOnStatement.forEach(function (x) { n.appendChild(card({ day: x.day, pence: -x.pence, what: x.label }, function (m) { m.appendChild(node('small', 'rec-note', 'Recorded, but no line in this statement. Cash, a later date, or a mistake?')); })); });
    }
    var auto = d.lines.filter(function (l) { return l.status === 'auto'; });
    if (auto.length) {
      var a = sec('Reconciled for you (' + auto.length + ')', 'rec-auto');
      auto.forEach(function (l) { a.appendChild(card(l, function (m) { matched(m, l, l.ticked && l.ticked.indexOf('paid') !== -1 ? 'Paid in full' : l.ticked && l.ticked.length ? 'Deposit paid' : 'Recorded', true); })); });
    }
    if (!todo.length && !d.notOnStatement.length) b.appendChild(node('p', 'mn-say tide-ok', 'All matched.'));
    var settled = d.lines.filter(function (l) { return ['matched', 'payout', 'reconciled'].indexOf(l.status) !== -1; });
    if (settled.length) {
      var f = node('details', 'pay-split'); f.appendChild(node('summary', null, 'Already in the books (' + settled.length + ')'));
      settled.forEach(function (l) {
        f.appendChild(card(l, function (m) {
          if (l.status === 'payout') m.appendChild(node('span', 'rec-to', 'Stripe card payout'));
          else if (l.status === 'reconciled') matched(m, l, 'Matched', true);
          else m.appendChild(node('span', 'rec-to', l.survey ? l.survey.name + ' (ticked by hand)' : l.logbook.label));
        }));
      });
      b.appendChild(f);
    }
  }

  /* A matched transfer: who it paid, Open their card, and Undo when this page matched it. */
  function matched(m, l, what, undo) {
    var who = node('button', 'rec-who', l.survey.name + (l.survey.postcode ? ', ' + l.survey.postcode : '')); who.type = 'button';
    who.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(l.survey.id, { onChange: function () { run(); } }); });
    m.appendChild(who); m.appendChild(node('span', 'rec-tag', what));
    if (undo) { var u = node('button', 'rec-undo', 'Undo'); u.type = 'button'; u.addEventListener('click', function () { act(u, { op: 'unreconcile', ref: l.ref }); }); m.appendChild(u); }
  }

  /* Money in: the likeliest survey with OK, or find it in the list. */
  function inCard(l, open) {
    return card(l, function (m) {
      var pickBox = node('div', 'rec-find'), sel = surveyPicker(l, open, l.survey && l.survey.id);
      var ok = okBtn('OK');
      ok.addEventListener('click', function () { var id = l.status === 'suggest' && pickBox.hidden ? l.survey.id : Number(sel.value); if (!id) { sel.focus(); return; } act(ok, { op: 'reconcile', line: line(l), jobId: id }); });
      if (l.status === 'suggest') {
        m.appendChild(node('small', 'rec-label', 'Match to'));
        var who = node('b', 'rec-sugg', l.survey.name + (l.survey.postcode ? ', ' + l.survey.postcode : '')); m.appendChild(who);
        var other = node('button', 'rec-other', 'Not them? Find another'); other.type = 'button';
        other.addEventListener('click', function () { pickBox.hidden = false; other.hidden = true; who.classList.add('is-off'); sel.focus(); });
        pickBox.hidden = true; pickBox.appendChild(sel);
        m.appendChild(pickBox); m.appendChild(ok); m.appendChild(other);
      } else {
        m.appendChild(node('small', 'rec-label', 'Find and match'));
        pickBox.appendChild(sel); m.appendChild(pickBox); m.appendChild(ok);
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
      m.appendChild(node('small', 'rec-label', l.guess ? 'Looks like' : 'Record as'));
      var ok = okBtn('OK');
      ok.addEventListener('click', function () {
        if (!sel.value) { sel.focus(); return; }
        var v = sel.value.split(':'), pence = -l.pence;
        act(ok, v[0] === 'cost' ? { op: 'expense', pence: pence, day: l.day, category: v[1], what: l.what, bankRef: l.ref }
          : { op: 'pay', who: v[1], how: v[2], pence: pence, day: l.day, note: l.what, bankRef: l.ref });
      });
      var row = node('div', 'rec-find'); row.appendChild(sel); m.appendChild(row); m.appendChild(ok);
    });
  }
})(window);
