/* One transaction per row, with its controls in the row: the category, the
   split between people, and for money in the job it paid for. Every change
   saves on the spot and the row is redrawn from what the server stored, so
   what is on screen is never a guess about what was saved.

   Loaded before bank.js, which supplies the data and the save function. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var rows = {};   // id -> tr, so a saved line is swapped in place

  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }

  function cap(s) { return String(s || '').replace(/^./, function (m) { return m.toUpperCase(); }); }

  /* Names from the books' own targets: the partners in damp's, the people
     who hold the business in the others. */
  function splitLabel(split, ctx) {
    if (!split.length) return '';
    var people = ctx.targets.filter(function (t) { return t.key !== 'tax'; });
    var everyone = people.length > 1 && people.every(function (t) { return split.indexOf(t.key) !== -1; }) && split.indexOf('tax') === -1;
    if (everyone) return 'Everyone';
    return split.map(function (key) {
      var t = ctx.targets.filter(function (x) { return x.key === key; })[0];
      return t ? (key === 'tax' ? 'Tax' : t.name) : cap(key);
    }).join(' + ');
  }

  function jobLabel(j) {
    return (j.customerName || 'No name') + ', ' + U.money(j.surveyPricePence)
      + (j.remedialPence ? ' + ' + U.money(j.remedialPence) : '') + ', ' + day(j.jobDate)
      + (j.paidAt ? ', paid' : j.receivedPence ? ', ' + U.money(j.receivedPence) + ' received' : '');
  }

  /* ---------- the controls ---------- */
  function select(options, value, onChange, label) {
    var s = document.createElement('select');
    s.setAttribute('aria-label', label);
    options.forEach(function (o) { s.appendChild(new Option(o[1], o[0])); });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function categorySelect(tx, ctx) {
    var flow = tx.amountPence > 0 ? 'in' : 'out';
    var options = ctx.categories
      .filter(function (c) { return c.flow === 'any' || c.flow === flow || c.key === tx.category; })
      .map(function (c) { return [c.key, c.label]; });
    return select(options, tx.category, function (v) { commit(tx, ctx, { category: v }); }, 'Category of ' + (tx.description || 'this line'));
  }

  function jobSelect(tx, ctx) {
    var suggested = tx.suggested || [];
    var options = [['', 'Not a job payment']];
    var seen = {};
    suggested.forEach(function (id) {
      ctx.jobs.forEach(function (j) { if (j.id === id) { options.push([String(j.id), 'Likely: ' + jobLabel(j)]); seen[j.id] = true; } });
    });
    ctx.jobs.forEach(function (j) { if (!seen[j.id]) options.push([String(j.id), jobLabel(j)]); });
    if (tx.jobId && !ctx.jobs.some(function (j) { return j.id === tx.jobId; })) {
      options.push([String(tx.jobId), (tx.job && tx.job.customerName) || 'Job ' + tx.jobId]);
    }
    return select(options, tx.jobId ? String(tx.jobId) : '', function (v) {
      commit(tx, ctx, { jobId: v ? Number(v) : null });
    }, 'Job paid by ' + (tx.description || 'this line'));
  }

  function splitToggles(tx, ctx) {
    var wrap = U.node('div', 'split');
    ctx.targets.forEach(function (t) {
      var label = t.key === 'tax' ? 'Tax' : t.name.split(' ')[0];
      var b = U.node('button', 'pill', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(tx.split.indexOf(t.key) !== -1));
      b.title = 'Share this line with ' + t.name;
      b.addEventListener('click', function () {
        var next = tx.split.indexOf(t.key) === -1 ? tx.split.concat([t.key]) : tx.split.filter(function (x) { return x !== t.key; });
        commit(tx, ctx, { split: next });
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* Paid in full once the job says so, or once what the bank has matched to
     it covers the price; part paid until then. */
  function paidLabel(tx, ctx) {
    if (tx.job && tx.job.paidAt) return 'Paid in full';
    var j = ctx.jobs.filter(function (x) { return x.id === tx.jobId; })[0];
    return j && j.surveyPricePence > 0 && j.receivedPence >= j.surveyPricePence ? 'Paid in full' : 'Part paid';
  }

  function status(tx, ctx) {
    var wrap = U.node('div', 'status');
    /* In a company's books spend is the company's unless it went to a person,
       so a categorised cost is settled, not waiting. */
    var companyCost = ctx.model !== 'damp' && tx.amountPence < 0 && tx.category !== 'other' && tx.category !== 'transfer';
    if (tx.jobId) wrap.appendChild(U.node('span', 'tag tag--good', paidLabel(tx, ctx)));
    else if (tx.split.length) wrap.appendChild(U.node('span', 'tag tag--good', splitLabel(tx.split, ctx)));
    else if (tx.category === 'transfer') wrap.appendChild(U.node('span', 'tag tag--muted', 'Left out'));
    else if (companyCost) wrap.appendChild(U.node('span', 'tag tag--muted', 'Company cost'));
    else wrap.appendChild(U.node('span', 'tag tag--warn', 'Needs attention'));
    var how = tx.jobId ? tx.matchKind : tx.split.length ? tx.splitKind : null;
    if (how) wrap.appendChild(U.node('span', 'tag tag--muted', how === 'manual' ? 'by hand' : 'auto'));
    return wrap;
  }

  /* ---------- a row ---------- */
  function row(tx, ctx) {
    var tr = document.createElement('tr');
    tr.dataset.id = String(tx.id);

    tr.appendChild(U.node('td', null, day(tx.postedOn)));

    var details = U.node('td', 'details');
    details.appendChild(U.node('strong', null, tx.description || tx.counterparty || 'No description'));
    var extra = [tx.reference, tx.counterparty && tx.counterparty !== tx.description ? tx.counterparty : null,
      tx.feePence ? 'includes ' + U.money(tx.feePence) + ' fee' : null].filter(Boolean);
    if (extra.length) details.appendChild(U.node('small', null, extra.join(' · ')));
    tr.appendChild(details);

    tr.appendChild(U.node('td', 'num', tx.amountPence > 0 ? U.money(tx.amountPence) : ''));
    tr.appendChild(U.node('td', 'num', tx.amountPence < 0 ? U.money(-tx.amountPence) : ''));

    var cat = document.createElement('td');
    cat.appendChild(categorySelect(tx, ctx));
    tr.appendChild(cat);

    var who = document.createElement('td');
    if (tx.amountPence > 0) who.appendChild(jobSelect(tx, ctx));
    if (!tx.jobId) who.appendChild(splitToggles(tx, ctx));
    tr.appendChild(who);

    var st = document.createElement('td');
    st.appendChild(status(tx, ctx));
    var note = U.node('small', 'row-note');
    note.hidden = true;
    st.appendChild(note);
    tr.appendChild(st);

    rows[tx.id] = tr;
    return tr;
  }

  async function commit(tx, ctx, patch) {
    var tr = rows[tx.id];
    if (tr) tr.style.opacity = '.5';
    var result = await ctx.save(tx.id, patch);
    if (!result.ok) {
      if (tr) { tr.style.opacity = ''; note(tr, result.error, true); }
      return;
    }
    if (result.similar) note(rows[tx.id], 'Also applied to ' + result.similar + (result.similar === 1 ? ' similar line' : ' similar lines'), false);
  }

  function note(tr, text, isError) {
    var n = tr && tr.querySelector('.row-note');
    if (!n) return;
    n.textContent = text;
    n.hidden = false;
    n.className = 'row-note' + (isError ? ' is-error' : '');
  }

  /* ---------- the table ---------- */
  function render(mount, list, ctx) {
    rows = {};
    mount.textContent = '';
    if (!list.length) {
      mount.appendChild(U.node('p', 'empty', ctx.empty || 'Nothing here.'));
      return;
    }
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    [['Date'], ['Details'], ['In', 'num'], ['Out', 'num'], ['Category'], ['Job or split'], ['Status', null, true]].forEach(function (h) {
      var th = U.node('th', h[1] || null, h[2] ? null : h[0]);
      if (h[2]) th.appendChild(U.node('span', 'sr-only', h[0]));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    list.forEach(function (tx) { tbody.appendChild(row(tx, ctx)); });
    table.appendChild(tbody);
    var wrap = U.node('div', 'tw');
    wrap.appendChild(table);
    mount.appendChild(wrap);
  }

  /** Redraws the rows the server sent back, in place. */
  function patch(list, ctx) {
    list.forEach(function (tx) {
      var old = rows[tx.id];
      if (old) old.replaceWith(row(tx, ctx));
    });
  }

  global.DSBANKROWS = { render: render, patch: patch };
})(window);
