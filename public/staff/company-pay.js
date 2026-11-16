/* Company, Pay (the owners' brief, 15 Nov 2026): a card each for Corp tax,
   Scott, Tom, Ben and Ronnie with what is owed now, a statement behind each
   card with Record a payment, and below every survey done with its split.
   Two books (the owners' fresh start, 16 Nov 2026): Tide and Stripe from
   15 Nov first, the Revolut book before it one tap away, each survey tagged
   with where its money came in. Worked out on the server (lib/pay-book.js);
   Scott and Tom only. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var node = U.node;
  var money = function (p) { var n = Number(p) || 0; return (n < 0 ? '−' : '') + '£' + (Math.abs(n) / 100).toLocaleString('en-GB', { minimumFractionDigits: Math.abs(n) % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  var day = function (d) { return d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''; };
  var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  var BRAND = { dampscan: 'DampScan', 'ati-london': 'ATi' };
  var PEOPLE = [['scott', 'Scott'], ['tom', 'Tom'], ['ben', 'Ben']];
  /* The company year runs to 30 November. */
  var yearStart = function () { var y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)); return (m === 12 ? y : y - 1) + '-12-01'; };
  var monthStart = function (back) { var d = new Date(today + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };
  var monthEnd = function (back) { var d = new Date(monthStart(back - 1) + 'T12:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  var RANGES = [['month', 'This month', function () { return [monthStart(0), null]; }], ['last', 'Last month', function () { return [monthStart(1), monthEnd(1)]; }],
    ['year', 'This year', function () { return [yearStart(), null]; }], ['all', 'All', function () { return [null, null]; }]];
  var state = { range: 'month', book: 'new', data: null };
  var BOOK = { new: 'Tide and Stripe', old: 'Revolut' };
  var LONG = { Stripe: 'Paid by card', Tide: 'Paid into Tide', Revolut: 'Paid into Revolut' };
  var via = function (v, long) { return node('span', 'pay-via is-' + String(v || '').toLowerCase(), long ? LONG[v] || v : v); };

  async function load() {
    var r = RANGES.filter(function (x) { return x[0] === state.range; })[0][2]();
    var q = [r[0] ? 'from=' + r[0] : '', r[1] ? 'to=' + r[1] : '', state.book === 'old' ? 'book=old' : ''].filter(Boolean).join('&');
    try { state.data = await U.get('/api/admin/pay' + (q ? '?' + q : '')); }
    catch (e) { el('state').textContent = e.message === 'unauthorised' ? '' : 'Pay is for the owners.'; return; }
    el('state').hidden = true; el('content').hidden = false;
    books(); cards(); range(); book(); check(); split();
  }

  /* Which book: the fresh one from the cut-over, or the Revolut one kept as it was. */
  function books() {
    var box = el('books'); box.textContent = '';
    /* Which book, as one quiet line (the owner's clean-up, 16 Nov 2026): this
       book and its dates at the left, the other one tap away at the right. */
    var o = state.data.other, line = node('div', 'pay-bookline');
    var here = node('span', 'c-l');
    here.appendChild(node('b', null, state.book === 'new' ? 'Tide and Stripe' : 'Revolut (old)'));
    here.appendChild(node('small', null, state.book === 'new' ? 'From ' + day(state.data.cutover) : 'Before ' + day(state.data.cutover) + ', kept as it was'));
    line.appendChild(here);
    var other = state.book === 'new' ? 'old' : 'new';
    var go = node('button', 'pay-booklink'); go.type = 'button';
    go.appendChild(node('span', null, other === 'old' ? 'Revolut (old)' : 'Tide and Stripe'));
    if (o && o.owed > 0) go.appendChild(node('small', null, money(o.owed) + ' owed'));
    go.addEventListener('click', function () { state.book = other; state.range = other === 'old' ? 'all' : 'month'; load(); });
    line.appendChild(go);
    box.appendChild(line);
  }

  /* One summary, then one row per person (most owed first, tax last); a row at nothing fades back. */
  function cards() {
    var box = el('cards'); box.textContent = '';
    var list = state.data.cards, tax = list.filter(function (c) { return c.key === 'tax'; })[0];
    var people = list.filter(function (c) { return c.key !== 'tax'; }).sort(function (a, b) { return b.owed - a.owed; });
    var owed = people.reduce(function (t, c) { return t + Math.max(0, c.owed); }, 0), coming = list.reduce(function (t, c) { return t + (c.coming || 0); }, 0);
    var sum = node('div', 'c-summary');
    var big = node('div', 'c-big'); big.appendChild(node('span', 'c-label', state.book === 'old' ? 'Owed from Revolut' : 'Owed to people')); big.appendChild(node('b', null, money(owed))); sum.appendChild(big);
    /* Corp tax lives here once, opening its statement, rather than again as a row. */
    var t = node('button', 'c-sumbtn'); t.type = 'button'; t.appendChild(node('span', 'c-label', 'Tax to set aside')); t.appendChild(node('b', null, money(tax ? Math.max(0, tax.owed) : 0)));
    t.addEventListener('click', function () { openCard('tax'); }); sum.appendChild(t);
    if (state.book === 'new') { var c = node('div'); c.appendChild(node('span', 'c-label', 'Coming once paid')); c.appendChild(node('b', null, money(coming))); sum.appendChild(c); }
    box.appendChild(sum);
    var rows = node('div', 'c-rows pay-people');
    people.forEach(function (p) {
      var r = node('button', 'c-row' + (!p.owed && !p.coming ? ' is-zero' : '')); r.type = 'button';
      var l = node('span', 'c-l'); l.appendChild(node('b', null, p.name));
      var bits = [];
      if (p.owed < 0) bits.push('Paid ahead');
      if (p.coming) bits.push(money(p.coming) + ' coming');
      if (p.lastPaid) bits.push('Last paid ' + day(p.lastPaid.day));
      if (bits.length) l.appendChild(node('small', null, bits.join(' · ')));
      var rr = node('span', 'c-r'); rr.appendChild(node('span', 'c-amt', money(Math.abs(p.owed)))); rr.appendChild(node('span', 'c-chev', '›'));
      r.appendChild(l); r.appendChild(rr);
      r.addEventListener('click', function () { openCard(p.key); });
      rows.appendChild(r);
    });
    box.appendChild(rows);
  }

  function range() {
    var box = el('range'); box.textContent = '';
    RANGES.forEach(function (r) {
      var b = node('button', 'pill', r[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(state.range === r[0]));
      b.addEventListener('click', function () { state.range = r[0]; load(); }); box.appendChild(b);
    });
  }

  /* One row per survey done: tap the name for their card, tap the row for the split. */
  function book() {
    var box = el('book'); box.textContent = '';
    var rows = state.data.rows, paidN = rows.filter(function (r) { return r.paid; }).length;
    var head = el('surveys-sum').querySelector('.c-l'); head.textContent = '';
    head.appendChild(node('b', null, 'Surveys')); head.appendChild(node('small', null, rows.length ? paidN + ' paid, ' + (rows.length - paidN) + ' coming' : 'None in this period'));
    if (!rows.length) { box.appendChild(node('p', 'panel-note', 'No surveys in this period.')); return; }
    rows.forEach(function (s) {
      var row = node('div', 'pay-row' + (s.paid ? '' : ' is-unpaid') + (s.odd ? ' is-odd' : ''));
      var top = node('div', 'pay-row-top');
      top.appendChild(node('span', 'pay-day', day(s.paidOn || s.day)));
      var who = node('button', 'pay-name', s.name); who.type = 'button';
      who.addEventListener('click', function (e) { e.stopPropagation(); if (global.DSPOP) global.DSPOP.open(s.id, { onChange: load }); });
      top.appendChild(who);
      top.appendChild(node('span', 'pay-brand', BRAND[s.site] || ''));
      top.appendChild(node('b', 'pay-price', money(s.price)));
      top.appendChild(s.paid ? via(s.via, true) : node('span', 'pay-tag', 'Not paid yet'));
      row.appendChild(top);
      var parts = node('div', 'pay-parts'); parts.hidden = true;
      if (s.fees) parts.appendChild(chip('Card fee', s.fees));
      state.data.cards.forEach(function (c) { if (s.share[c.key]) parts.appendChild(chip(c.name, s.share[c.key])); });
      if (s.odd) parts.appendChild(node('p', 'pay-warn', 'A share is below zero: the price is under the surveyor\'s fee. Check the price on their card.'));
      if (!s.paid) parts.appendChild(node('p', 'panel-note', 'Counts once they have paid in full.'));
      row.appendChild(parts);
      row.addEventListener('click', function () { parts.hidden = !parts.hidden; row.classList.toggle('is-open', !parts.hidden); });
      box.appendChild(row);
    });
    var t = state.data.totals, tot = node('div', 'pay-row pay-total'), top2 = node('div', 'pay-row-top');
    top2.appendChild(node('span', 'pay-day', ''));
    top2.appendChild(node('span', 'pay-name-t', rows.length + ' survey' + (rows.length === 1 ? '' : 's')));
    top2.appendChild(node('b', 'pay-price', money(t.price)));
    tot.appendChild(top2);
    var parts2 = node('div', 'pay-parts');
    if (t.fees) parts2.appendChild(chip('Card fees', t.fees));
    state.data.cards.forEach(function (c) { if (t[c.key]) parts2.appendChild(chip(c.name, t[c.key])); });
    tot.appendChild(parts2);
    box.appendChild(tot);
  }
  function chip(label, pence) { var c = node('span', 'pay-chip' + (pence < 0 ? ' is-neg' : '')); c.appendChild(node('small', null, label)); c.appendChild(node('b', null, money(pence))); return c; }

  function check() {
    var c = state.data.check;
    el('check').textContent = c.in === c.out ? 'Adds up: ' + money(c.in) + ' paid in, after card fees, is all shared out.' : 'Does not add up: ' + money(c.in) + ' in, ' + money(c.out) + ' shared. Tell Scott.';
    el('check').className = 'pay-check' + (c.in === c.out ? '' : ' is-bad');
  }

  /* The card that pops open: owed now, Record a payment, then the statement with its running balance. */
  async function openCard(who) {
    var dlg = el('pay-dlg') || (function () { var d = node('dialog', 'sheet'); d.id = 'pay-dlg'; document.body.appendChild(d); d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); return d; })();
    dlg.textContent = '';
    var s;
    try { s = await U.get('/api/admin/pay?who=' + who); } catch (e) { return; }
    var head = node('header', 'sheet-head'), top = node('div', 'sheet-top');
    top.appendChild(node('h2', null, s.name));
    var shut = node('button', 'btn btn--ghost btn--sm', 'Close'); shut.type = 'button'; shut.addEventListener('click', function () { dlg.close(); }); top.appendChild(shut);
    head.appendChild(top); dlg.appendChild(head);
    var body = node('div', 'sheet-body');
    /* The book being looked at leads; the other is under the line, never mixed into its balance. */
    var owed = state.book === 'old' ? s.old.owed : s.owed;
    var hero = node('div', 'pay-hero'); hero.appendChild(node('small', null, (owed < 0 ? 'Paid ahead by' : who === 'tax' ? 'To set aside' : 'Owed now') + ', ' + BOOK[state.book])); hero.appendChild(node('b', null, money(Math.abs(owed)))); body.appendChild(hero);
    body.appendChild(payForm(who, owed, function () { dlg.close(); load().then(function () { openCard(who); }); }));
    if (s.coming && s.coming.length) {
      body.appendChild(node('h3', 'pay-h', 'Coming once paid in full'));
      s.coming.forEach(function (c) { var r = node('div', 'pay-line is-coming'); var lft = node('div'); lft.appendChild(node('span', 'pay-line-what', c.what)); r.appendChild(lft); var amt = node('div', 'pay-line-amt'); amt.appendChild(node('b', null, money(c.pence))); r.appendChild(amt); r.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(c.jobId, { onChange: load }); }); body.appendChild(r); });
    }
    body.appendChild(node('h3', 'pay-h', 'Statement, Tide and Stripe'));
    if (!s.lines.length) body.appendChild(node('p', 'panel-note', 'Nothing yet.'));
    s.lines.forEach(function (l) { body.appendChild(line(l, false)); });
    var cut = node('div', 'pay-cut'); cut.appendChild(node('span', null, 'Moved to Tide and Stripe, ' + day(s.cutover))); body.appendChild(cut);
    var oldBox = node('details', 'pay-old'); oldBox.open = state.book === 'old';
    oldBox.appendChild(node('summary', null, 'Revolut, before ' + day(s.cutover) + (s.old.owed ? ': ' + (s.old.owed < 0 ? 'paid ahead ' : 'owed ') + money(Math.abs(s.old.owed)) : ': settled')));
    if (!s.old.lines.length) oldBox.appendChild(node('p', 'panel-note', 'Nothing in Revolut.'));
    s.old.lines.forEach(function (l) { oldBox.appendChild(line(l, true)); });
    body.appendChild(oldBox);
    dlg.appendChild(body);
    if (!dlg.open) dlg.showModal();

    function line(l, old) {
      var row = node('div', 'pay-line' + (l.kind === 'paid' ? ' is-out' : '') + (old ? ' is-old' : ''));
      var left = node('div'); var what = node('span', 'pay-line-what', l.what); what.appendChild(via(l.via)); left.appendChild(what); left.appendChild(node('small', null, day(l.day) + (l.by ? ', by ' + l.by : '')));
      row.appendChild(left);
      var right = node('div', 'pay-line-amt'); right.appendChild(node('b', null, (l.pence > 0 ? '+' : '') + money(l.pence))); right.appendChild(node('small', null, money(l.balance)));
      row.appendChild(right);
      if (l.kind === 'earned') row.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(l.jobId, { onChange: load }); });
      if (l.kind === 'paid') {
        var rm = node('button', 'pay-rm', 'Remove'); rm.type = 'button';
        rm.addEventListener('click', async function () {
          if (!global.confirm('Remove this payment of ' + money(-l.pence) + '? Only for one entered by mistake.')) return;
          await U.send('/api/admin/pay', { op: 'remove', id: l.id }); dlg.close(); load().then(function () { openCard(who); });
        });
        left.appendChild(rm);
      }
      return row;
    }
  }

  function payForm(who, owed, done) {
    var f = node('form', 'pay-form');
    var amt = document.createElement('input'); amt.type = 'number'; amt.step = '0.01'; amt.min = '0.01'; amt.inputMode = 'decimal'; amt.value = owed > 0 ? (owed / 100).toFixed(2) : ''; amt.setAttribute('aria-label', 'Amount in pounds');
    var on = document.createElement('input'); on.type = 'date'; on.value = today; on.setAttribute('aria-label', 'Paid on');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'How');
    (who === 'tax' ? ['Moved to tax savings', 'Paid to HMRC'] : ['Bank transfer', 'Salary', 'Dividend', 'Cash', 'Other']).forEach(function (h) { var o = document.createElement('option'); o.textContent = h; how.appendChild(o); });
    var note = document.createElement('input'); note.type = 'text'; note.placeholder = 'Note (optional)'; note.setAttribute('aria-label', 'Note');
    var go = node('button', 'btn btn--primary', (who === 'tax' ? 'Record it' : 'Record a payment') + (state.book === 'old' ? ' from Revolut' : '')); go.type = 'submit';
    var msg = node('p', 'panel-note');
    f.appendChild(amt); f.appendChild(on); f.appendChild(how); f.appendChild(note); f.appendChild(go); f.appendChild(msg);
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var pence = Math.round(Number(amt.value) * 100);
      if (!(pence > 0)) { msg.textContent = 'Enter the amount.'; amt.focus(); return; }
      go.disabled = true;
      var r = await U.send('/api/admin/pay', { op: 'pay', who: who, pence: pence, day: on.value, how: how.value, note: note.value, book: state.book });
      go.disabled = false;
      if (!r.ok) { msg.textContent = (r.data && r.data.error) || 'Not saved.'; return; }
      done();
    });
    return f;
  }

  /* The split new surveys are booked with; surveys already booked keep theirs. */
  function split() {
    var box = el('split-form'), s = state.data.settings; box.textContent = '';
    var f = node('form', 'pay-form');
    var num = function (label, v) { var l = node('label', 'pay-field'); l.appendChild(node('span', null, label)); var i = document.createElement('input'); i.type = 'number'; i.step = '0.01'; i.min = '0'; i.max = '100'; i.value = (v / 100).toString(); l.appendChild(i); f.appendChild(l); return i; };
    var pick = function (label, v) { var l = node('label', 'pay-field'); l.appendChild(node('span', null, label)); var sel = document.createElement('select'); PEOPLE.forEach(function (p) { var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1]; o.selected = p[0] === v; sel.appendChild(o); }); l.appendChild(sel); f.appendChild(l); return sel; };
    var tax = num('Tax set aside, %', s.taxBp), lead = num('Lead fee, %', s.leadBp), earner = pick('Lead fee goes to', s.leadEarner), a = pick('Rest split between', s.partnerA), b = pick('and', s.partnerB);
    var go = node('button', 'btn btn--primary', 'Save split'); go.type = 'submit'; f.appendChild(go);
    var msg = node('p', 'panel-note', 'Changes the split for surveys booked from now on. Ones already booked keep theirs.'); f.appendChild(msg);
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var r = await U.send('/api/admin/pay', { op: 'split', taxBp: Math.round(Number(tax.value) * 100), leadBp: Math.round(Number(lead.value) * 100), leadEarner: earner.value, partnerA: a.value, partnerB: b.value });
      msg.textContent = r.ok ? 'Saved.' : (r.data && r.data.error) || 'Not saved.';
    });
    box.appendChild(f);
  }

  /* Overview's "Ronnie is owed £X" opens that person's statement. */
  global.DSCOPAY = { open: openCard };
  load();
})(window);
