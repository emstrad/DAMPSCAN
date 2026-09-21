/* Quoted work: state, loading, the money tiles, the list and the new job form.
   The working screen for one job is in quoted-job.js and quoted-lines.js,
   the last of which fires the first load once all three files are parsed.

   Pounds are typed and displayed; whole pence are all that cross the wire. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };

  var state = { site: '', range: '30d', me: null, people: [], jobs: [], open: null, opener: null };

  /* Statuses that mean the job did not happen. Listed, never counted. */
  var VOID = { declined: true, cancelled: true, refunded: true };

  function business(slug) {
    var list = (state.me && state.me.businesses) || [];
    for (var i = 0; i < list.length; i += 1) if (list[i].slug === slug) return list[i];
    return null;
  }

  /** Businesses the viewer may see whose jobs are quoted, not surveyed. */
  function quotedBusinesses() {
    return ((state.me && state.me.businesses) || []).filter(function (b) { return b.payoutModel !== 'damp'; });
  }

  function personName(id) {
    for (var i = 0; i < state.people.length; i += 1) if (state.people[i].id === id) return state.people[i].name;
    return id == null ? 'Not recorded' : 'Person ' + id;
  }

  /* The engine names an air conditioning half 'scott' or 'tom'; the roofing
     rows name a person by id. Either way, a name for the screen. */
  function rowName(row) {
    if (row.personId != null) return personName(row.personId);
    if (row.key === 'finder') return 'Finder';
    return row.key.charAt(0).toUpperCase() + row.key.slice(1);
  }

  /** What Scott is owed on a job, whichever engine worked it out. */
  function scottOn(j) {
    if (j.model === 'roofing') return j.payout.scottFee;
    if (j.model === 'ac') return j.payout.pay.scott || 0;
    return 0;
  }

  function canManage(site) {
    if (!state.me) return false;
    var b = business(site);
    return state.me.isAdmin || (b && b.level === 'manage');
  }

  /* ---------- views ---------- */
  function renderTiles() {
    var t = { jobs: 0, invoiced: 0, costs: 0, received: 0, outstanding: 0, scott: 0, losses: 0 };
    state.jobs.forEach(function (j) {
      if (VOID[j.status]) return;
      t.jobs += 1;
      t.invoiced += j.invoiceNetPence;
      t.costs += j.costs.reduce(function (s, c) { return s + c.amountPence; }, 0);
      t.received += j.money.receivedPence;
      t.outstanding += Math.max(0, j.money.outstandingPence);
      t.scott += scottOn(j);
      if (j.payout.lossMaking) t.losses += 1;
    });
    var mount = el('tiles');
    mount.textContent = '';
    [['Scott', U.money(t.scott), true], ['Jobs', U.num(t.jobs)], ['Invoiced', U.money(t.invoiced)],
      ['Costs', U.money(t.costs)], ['Received', U.money(t.received)], ['Outstanding', U.money(t.outstanding)]]
      .forEach(function (tile) {
        var d = U.node('div', 'tile' + (tile[2] ? ' is-key' : ''));
        d.appendChild(U.node('span', 'k', tile[0]));
        d.appendChild(U.node('span', 'v', tile[1]));
        mount.appendChild(d);
      });

    var lines = [];
    var names = quotedBusinesses().map(function (b) { return b.name; });
    if (business('roofing') && (!state.site || state.site === 'roofing')) {
      lines.push('Verge Roofing: every cost line comes off the invoice, 19% of what is left is set aside for '
        + 'Corporation Tax, and Scott is paid 5% of the rest or 50 pounds, whichever is more. Owners are paid '
        + 'their days at the day rate on the job; the company keeps what remains, shown negative when it is a loss.');
    }
    if (business('ac') && (!state.site || state.site === 'ac')) {
      lines.push('CoolRight: the invoice less every cost line is the profit, split in half between Scott and Tom. '
        + 'A loss pays nobody and is shown as a loss.');
    }
    lines.push('Declined, cancelled and refunded jobs are listed but not counted.'
      + (t.losses ? ' ' + t.losses + (t.losses === 1 ? ' job is' : ' jobs are') + ' loss making.' : ''));
    el('basis').textContent = names.length ? lines.join(' ') : 'No quoted businesses in your scope.';
  }

  /* Each figure in its own unbreakable span, so a wrapped cell never splits
     a minus sign from its number. */
  function payoutSummary(j) {
    var cell = U.node('span');
    var parts = [];
    if (j.model === 'roofing') {
      var p = j.payout;
      parts.push(['Fee ', p.scottFee, p.floorApplied ? ' (floor)' : '']);
      if (p.wages) parts.push([', wages ', p.wages, '']);
      parts.push([', kept ', p.retained, '']);
    } else if (j.model === 'ac') {
      parts.push(['', j.payout.pay.scott, ' / ']);
      parts.push(['', j.payout.pay.tom, '']);
    }
    parts.forEach(function (part) {
      cell.appendChild(document.createTextNode(part[0]));
      cell.appendChild(U.node('span', 'nowrap', U.money(part[1])));
      cell.appendChild(document.createTextNode(part[2]));
    });
    return cell;
  }

  function statusTag(j) {
    var wrap = U.node('span', 'status');
    var tone = VOID[j.status] ? ' tag--muted' : j.status === 'paid' ? ' tag--good' : j.status === 'quoted' ? ' tag--accent' : '';
    wrap.appendChild(U.node('span', 'tag' + tone, j.status));
    if (j.frozen) wrap.appendChild(U.node('span', 'tag tag--good', 'frozen'));
    if (j.payout.lossMaking && !VOID[j.status]) wrap.appendChild(U.node('span', 'tag tag--warn', 'loss'));
    return wrap;
  }

  function renderJobs() {
    U.table(el('jobs'), [
      { label: 'Date', get: function (j) { return j.jobDate ? String(j.jobDate).slice(0, 10) + (j.jobTime ? ' ' + j.jobTime : '') : ''; } },
      { label: 'Customer', get: function (j) { return j.customerName || 'Not given'; } },
      { label: 'Business', get: function (j) { return j.business; } },
      { label: 'Invoice', numeric: true, get: function (j) { return U.money(j.invoiceNetPence); } },
      { label: 'Costs', numeric: true, get: function (j) { return U.money(j.costs.reduce(function (s, c) { return s + c.amountPence; }, 0)); } },
      { label: 'Received', numeric: true, get: function (j) { return U.money(j.money.receivedPence); } },
      { label: 'Payout', wrap: true, get: payoutSummary },
      { label: 'Status', get: statusTag },
      { label: 'Open', sr: true, get: function (j) {
        var open = U.node('button', 'pill', 'Open');
        open.type = 'button';
        open.dataset.id = String(j.id);
        open.addEventListener('click', function () { openJob(j, open); });
        return open;
      } }
    ], state.jobs, { empty: 'No quoted jobs in this period.' });
  }

  function openJob(job, opener) {
    state.open = job;
    state.opener = opener || null;
    global.DSQJOB.fill(job);
    el('job-dialog').showModal();
  }

  /** A fresh copy of a job from the server replaces the one in the list. */
  function replace(fresh) {
    var found = false;
    state.jobs = state.jobs.map(function (j) { if (j.id === fresh.id) { found = true; return fresh; } return j; });
    if (!found) state.jobs.unshift(fresh);
    state.open = fresh;
    renderTiles();
    renderJobs();
  }

  /* ---------- the new job form ---------- */
  function fillPeople(select, site, chosen) {
    select.textContent = '';
    select.appendChild(new Option('Not recorded', ''));
    state.people.forEach(function (p) {
      var on = p.businesses.some(function (b) { return b.slug === site; });
      if (on) select.appendChild(new Option(p.name, String(p.id)));
    });
    select.value = chosen != null && select.querySelector('option[value="' + chosen + '"]') ? String(chosen) : '';
  }

  function resetForm() {
    var sites = quotedBusinesses();
    var pick = el('q-site');
    pick.textContent = '';
    sites.forEach(function (b) { pick.appendChild(new Option(b.name, b.slug)); });
    pick.value = state.site && business(state.site) ? state.site : (sites[0] ? sites[0].slug : '');
    fillPeople(el('q-finder'), pick.value, state.me && state.me.personId);
    el('q-name').value = ''; el('q-postcode').value = ''; el('q-invoice').value = '';
    el('q-date').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    el('q-time').value = ''; el('q-status').value = 'quoted'; el('q-note').value = '';
    el('q-error').classList.remove('is-shown');
    el('q-save').disabled = !sites.length;
  }

  async function saveNew(e) {
    e.preventDefault();
    var err = el('q-error');
    err.classList.remove('is-shown');
    var invoice = U.toPence(el('q-invoice').value);
    if (invoice === null) { err.textContent = 'The invoice must be a number.'; err.classList.add('is-shown'); return; }
    var res = await U.send('/api/admin/quoted', {
      op: 'save', site: el('q-site').value,
      customerName: el('q-name').value, customerPostcode: el('q-postcode').value,
      invoiceNetPence: invoice, jobDate: el('q-date').value || undefined, jobTime: el('q-time').value || null,
      status: el('q-status').value, finderPersonId: el('q-finder').value || null, note: el('q-note').value
    });
    if (!res.ok) {
      var errors = (res.data && res.data.errors) || {};
      var first = Object.keys(errors)[0];
      err.textContent = first ? errors[first] : 'That job could not be saved.';
      err.classList.add('is-shown');
      return;
    }
    resetForm();
    replace(res.data.job);
    var opener = document.querySelector('#jobs button[data-id="' + res.data.job.id + '"]');
    openJob(res.data.job, opener);
  }

  /* ---------- loading ---------- */
  async function refresh() {
    var qs = '?range=' + state.range + (state.site ? '&site=' + state.site : '');
    try {
      if (!state.me) state.me = await U.get('/api/admin/me');
      state.people = (await U.get('/api/admin/people')).people || [];
      state.jobs = (await U.get('/api/admin/quoted' + qs)).jobs || [];
      renderTiles();
      renderJobs();
      if (!el('q-site').options.length) resetForm();
      el('state').hidden = true;
      el('content').hidden = false;
    } catch (e) {
      el('state').textContent = e.message || 'Could not load quoted work.';
      el('state').hidden = false;
    }
  }

  function pills(selector, key) {
    document.querySelectorAll(selector).forEach(function (pill) {
      pill.addEventListener('click', function () {
        state[key] = pill.dataset[key];
        document.querySelectorAll(selector).forEach(function (p) { p.setAttribute('aria-pressed', String(p === pill)); });
        refresh();
      });
    });
  }
  pills('[data-site]', 'site');
  U.scopePills('[data-site]');
  pills('[data-range]', 'range');

  el('q-form').addEventListener('submit', saveNew);
  el('q-reset').addEventListener('click', resetForm);
  el('q-site').addEventListener('change', function () { fillPeople(el('q-finder'), el('q-site').value, state.me && state.me.personId); });
  el('refresh').addEventListener('click', refresh);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });
  el('csv').addEventListener('click', function () {
    U.downloadCsv('quoted-' + state.range + '.csv', [
      ['Date', function (j) { return j.jobDate ? String(j.jobDate).slice(0, 10) : ''; }],
      ['Business', function (j) { return j.business; }],
      ['Customer', function (j) { return j.customerName || ''; }],
      ['Postcode', function (j) { return j.customerPostcode || ''; }],
      ['Invoice net', function (j) { return (j.invoiceNetPence / 100).toFixed(2); }],
      ['Costs', function (j) { return (j.costs.reduce(function (s, c) { return s + c.amountPence; }, 0) / 100).toFixed(2); }],
      ['Received', function (j) { return (j.money.receivedPence / 100).toFixed(2); }],
      ['Scott', function (j) { return (scottOn(j) / 100).toFixed(2); }],
      ['Status', function (j) { return j.status; }],
      ['Frozen', function (j) { return j.frozen ? String(j.frozen.at).slice(0, 10) : ''; }],
      ['Note', function (j) { return j.note || ''; }]
    ], state.jobs);
  });

  global.DSQ = {
    state: state, business: business, personName: personName, rowName: rowName,
    canManage: canManage, fillPeople: fillPeople, refresh: refresh, replace: replace
  };
})(window);
