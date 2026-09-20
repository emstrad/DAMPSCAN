/* Bank reconciliation: state, loading, the balances and the reconciliation.
   The transaction rows are in bank-rows.js and the upload in bank-import.js;
   this file owns the data and hands each of them what they need. Loaded last,
   so both are defined before anything renders. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var ROWS = global.DSBANKROWS;
  var IMPORT = global.DSBANKIMPORT;
  var el = function (id) { return document.getElementById(id); };

  var state = { view: 'attention', from: '', query: '', data: null };

  var PEOPLE = [['scott', 'Scott'], ['tom', 'Tom'], ['ben', 'Ben'], ['tax', 'Tax pot']];

  /* `lead` is '?' or '&', depending on whether the URL already has a query. */
  function fromQs(lead) { return state.from ? lead + 'from=' + state.from : ''; }

  /* ---------- the balances ---------- */
  function tile(mount, label, value, sub, key) {
    var d = U.node('div', 'tile' + (key ? ' is-key' : ''));
    d.appendChild(U.node('span', 'k', label));
    d.appendChild(U.node('span', 'v', value));
    if (sub) d.appendChild(U.node('span', 's', sub));
    mount.appendChild(d);
  }

  function renderTiles(t) {
    var mount = el('tiles');
    mount.textContent = '';
    PEOPLE.forEach(function (p) {
      var earned = p[0] === 'tax' ? t.earned.taxSetAside : t.earned[p[0]];
      tile(mount, p[1], U.money(t.balances[p[0]]),
        U.money(earned) + ' from paid jobs, ' + U.money(t.shares[p[0]]) + ' from the bank', true);
    });
    tile(mount, 'Bank in', U.money(t.bank.inPence), U.num(t.jobs.paid) + ' paid ' + (t.jobs.paid === 1 ? 'job' : 'jobs'));
    tile(mount, 'Bank out', U.money(t.bank.outPence), U.num(t.lines) + ' lines');
    tile(mount, 'Needs attention', U.num(t.waiting), t.waiting ? 'lines not yet matched or split' : 'everything is allocated');
    tile(mount, 'Owed by customers', U.money(t.jobs.owedPence), U.num(t.jobs.unpaid) + ' unpaid ' + (t.jobs.unpaid === 1 ? 'job' : 'jobs'));
  }

  /* Both sides of the identity, so a person can see where a pound went. The
     bottom line agrees with the top one whenever the books balance, and the
     tag says which it is. */
  /* The jobs behind the difference, named underneath it. A bare number nobody
     can chase is the one line on this page that would stay a mystery, and the
     deltas here are the whole of it, so the list ends the hunt. */
  function whyRows(jobs) {
    return (jobs || []).map(function (j) {
      var tr = document.createElement('tr');
      tr.className = 'is-why';
      var who = (j.customerName || 'Job ' + j.id) + ', ' + (j.jobDate || '');
      var td = U.node('td', null, who + ' — ' + U.money(j.receivedPence) + ' matched against '
        + U.money(j.countedValuePence) + ': ' + j.reason);
      tr.appendChild(td);
      tr.appendChild(U.node('td', 'num', U.money(j.deltaPence)));
      return tr;
    });
  }

  function renderRecon(t) {
    var balanced = t.explainedPence === t.bank.netPence;
    var rows = [
      ['Bank in, less bank out', t.bank.netPence, 'is-total'],
      ['Scott', t.balances.scott], ['Tom', t.balances.tom], ['Ben', t.balances.ben], ['Tax pot', t.balances.tax],
      ['Remedial work settled offline between Tom and Ben', t.remedialOfflinePence],
      ['Deposits on jobs not yet paid in full', t.partPaidPence],
      ['Money in not yet matched to a job or split', t.unmatchedInPence],
      ['Spend not yet split', t.unsplitOutPence],
      ['Difference: bank money on paid jobs against what those jobs are recorded as worth',
        t.differencePence, null, whyRows(t.differenceJobs)],
      ['Adds up to', t.explainedPence, 'is-total']
    ];
    var table = document.createElement('table');
    var body = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r[2]) tr.className = r[2];
      tr.appendChild(U.node('td', null, r[0]));
      tr.appendChild(U.node('td', 'num', U.money(r[1])));
      body.appendChild(tr);
      if (r[3]) r[3].forEach(function (child) { body.appendChild(child); });
    });
    var last = body.lastChild.firstChild;
    last.appendChild(document.createTextNode(' '));
    last.appendChild(U.node('span', 'tag ' + (balanced ? 'tag--good' : 'tag--warn'), balanced ? 'Balances' : 'Does not balance'));
    table.appendChild(body);
    var mount = el('recon');
    mount.textContent = '';
    mount.appendChild(table);

    el('basis').textContent = 'From ' + (t.from || 'the first imported line') + '. A person\'s figure is what the '
      + 'paid jobs say they earned plus their share of every bank line split to them, so drawings paid out to '
      + 'them and spend that was theirs come off it. The tax pot is what the paid jobs set aside less what has '
      + 'gone to HMRC. Transfers between your own accounts are left out of everything.';
  }

  function renderStatements(list) {
    U.table(el('statements'), [
      { label: 'Uploaded', get: function (s) { return U.when(s.importedAt); } },
      { label: 'File', get: function (s) { return s.filename || 'statement'; } },
      { label: 'Covers', get: function (s) { return s.firstOn ? s.firstOn + ' to ' + s.lastOn : ''; } },
      { label: 'Lines added', numeric: true, get: function (s) { return U.num(s.rowsAdded) + ' of ' + U.num(s.rowsSeen); } },
      { label: '', get: function (s) {
        var b = U.node('button', 'pill', 'Remove');
        b.type = 'button';
        b.addEventListener('click', function () { IMPORT.remove(s); });
        return b;
      } }
    ], list, { empty: 'Nothing uploaded yet.' });
  }

  /* ---------- the lines ---------- */
  var squash = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); };

  function matches(tx, query) {
    var hay = [tx.description, tx.reference, tx.counterparty, tx.job && tx.job.customerName, tx.category]
      .filter(Boolean).join(' ').toLowerCase();
    var tight = hay.replace(/\s+/g, '');
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) {
      return hay.indexOf(tok) !== -1 || tight.indexOf(squash(tok)) !== -1;
    });
  }

  function shown() {
    var list = state.data.transactions;
    return state.query ? list.filter(function (tx) { return matches(tx, state.query); }) : list;
  }

  function renderLines() {
    var list = shown();
    var empty = {
      attention: 'Nothing waiting. Every line is matched to a job or split between people.',
      in: 'No money in for this period.', out: 'No money out for this period.', all: 'No lines yet. Upload a statement above.'
    };
    ROWS.render(el('lines'), list, { categories: state.data.categories, jobs: state.data.jobs, save: save, empty: empty[state.view] });
    el('lines-note').textContent = list.length
      ? U.num(list.length) + (list.length === 1 ? ' line' : ' lines') + (state.query ? ' matching' : '')
        + '. Changing a category or a split saves straight away and teaches the importer for next time.'
      : '';
  }

  /* ---------- saving ---------- */
  function absorb(rows, totals) {
    var fresh = {};
    rows.forEach(function (tx) { fresh[tx.id] = tx; });
    state.data.transactions = state.data.transactions.map(function (tx) { return fresh[tx.id] || tx; });
    if (totals) { state.data.totals = totals; renderTiles(totals); renderRecon(totals); }
    ROWS.patch(rows, { categories: state.data.categories, jobs: state.data.jobs, save: save });
  }

  async function save(id, patch) {
    var body = { id: id };
    Object.keys(patch).forEach(function (k) { body[k] = patch[k]; });
    var res = await U.send('/api/admin/bank' + fromQs('?'), body);
    if (!res.ok) {
      var errors = (res.data && res.data.errors) || {};
      var first = Object.keys(errors)[0];
      return { ok: false, error: first ? errors[first] : 'That could not be saved.' };
    }
    absorb(res.data.transactions, res.data.totals);
    return { ok: true, similar: res.data.similar };
  }

  /* ---------- loading and wiring ---------- */
  async function refresh() {
    try {
      var data = await U.get('/api/admin/bank?view=' + state.view + fromQs('&'));
      state.data = data;
      renderTiles(data.totals);
      renderRecon(data.totals);
      renderStatements(data.statements);
      renderLines();
      if (!state.from && data.totals.from) el('from').placeholder = data.totals.from;
      el('state').hidden = true;
      el('content').hidden = false;
    } catch (err) {
      el('state').textContent = err.message || 'Could not load the bank.';
      el('state').hidden = false;
    }
  }

  document.querySelectorAll('[data-view]').forEach(function (pill) {
    pill.addEventListener('click', function () {
      state.view = pill.dataset.view;
      document.querySelectorAll('[data-view]').forEach(function (p) { p.setAttribute('aria-pressed', String(p === pill)); });
      refresh();
    });
  });

  el('from').addEventListener('change', function () { state.from = el('from').value || ''; refresh(); });

  var searchTimer = 0;
  el('search').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.query = el('search').value.trim(); renderLines(); }, 120);
  });

  IMPORT.wire({ fromQs: fromQs, refresh: refresh });

  el('refresh').addEventListener('click', refresh);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });

  refresh();
})(window);
