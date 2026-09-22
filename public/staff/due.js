/* What needs doing: one page, in the order a morning goes. Every row links
   to the page where the thing gets done. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var state = { site: '', data: null };

  var SITE = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge Roofing', ac: 'CoolRight' };
  var brand = function (r) { return SITE[r.site] || r.site; };

  function link(href, text) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'pill';
    a.textContent = text;
    return a;
  }

  /* Where a row gets acted on: the Quotes working screen for quoted work,
     the client card or the job form for a survey, the dashboard for a lead. */
  function open(r) {
    if (r.quoted || r.invoicePence !== undefined) return link('/staff/quoted.html#job-' + r.id, 'Open');
    return link('/staff/jobs.html#job-' + r.id, 'Open');
  }

  function when(iso) {
    return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : '';
  }

  function dayLabel(d) {
    if (!d) return '';
    var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    var t = new Date(today + 'T00:00:00'); t.setDate(t.getDate() + 1);
    var tomorrow = t.toLocaleDateString('en-CA');
    if (d === today) return 'Today';
    if (d === tomorrow) return 'Tomorrow';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function renderTiles(d) {
    var mount = el('tiles');
    mount.textContent = '';
    var owed = d.owed.reduce(function (s, r) { return s + r.owedPence; }, 0);
    var tiles = [
      ['Enquiries waiting', U.num(d.enquiries.length), d.enquiries.length > 0],
      ['Visits this week', U.num(d.visits.length), false],
      ['Quotes out', U.num(d.quotes.length), false],
      ['Services due', U.num(d.services.length), d.services.some(function (r) { return r.daysUntilDue < 0; })]
    ];
    if (d.money) tiles.push(['Owed by customers', U.money(owed), false], ['Ready to freeze', U.num(d.ready.length), d.ready.length > 0], ['Drifted', U.num(d.drifted.length), d.drifted.length > 0]);
    tiles.forEach(function (t) {
      var tile = U.node('div', 'tile' + (t[2] ? ' is-key' : ''));
      tile.appendChild(U.node('span', 'k', t[0]));
      tile.appendChild(U.node('span', 'v', t[1]));
      mount.appendChild(tile);
    });
  }

  function render(d) {
    renderTiles(d);
    U.table(el('enquiries'), [
      { label: 'Received', get: function (r) { return U.when(r.createdAt); } },
      { label: 'Brand', get: brand },
      { label: 'Name', get: function (r) { return r.firstName; } },
      { label: 'Postcode', get: function (r) { return r.postcode; } },
      { label: 'About', wrap: true, get: function (r) { return r.issues.join(', '); } },
      { label: 'Open', sr: true, get: function (r) { return link('/staff/dashboard.html', 'Dashboard'); } }
    ], d.enquiries, { empty: 'Every enquiry from the last month has a job, or is older than that.' });

    U.table(el('visits'), [
      { label: 'When', get: function (r) { return dayLabel(r.jobDate) + (r.jobTime ? ' ' + r.jobTime : ''); } },
      { label: 'Brand', get: brand },
      { label: 'Customer', get: function (r) { return r.customerName || 'Not given'; } },
      { label: 'Postcode', get: function (r) { return r.postcode || ''; } },
      { label: 'Value', numeric: true, get: function (r) { return U.money(r.valuePence); } },
      { label: 'Open', sr: true, get: open }
    ], d.visits, { empty: 'Nothing booked in the next seven days.' });

    U.table(el('quotes'), [
      { label: 'Out for', get: function (r) { return r.ageDays + (r.ageDays === 1 ? ' day' : ' days'); } },
      { label: 'Brand', get: brand },
      { label: 'Customer', get: function (r) { return r.customerName || 'Not given'; } },
      { label: 'Postcode', get: function (r) { return r.postcode || ''; } },
      { label: 'Quoted', numeric: true, get: function (r) { return U.money(r.invoicePence); } },
      { label: 'Open', sr: true, get: open }
    ], d.quotes, { empty: 'No quotes waiting on an answer.', onRow: function (tr, r) { if (r.ageDays >= 7) tr.className = 'is-stale'; } });

    U.table(el('services'), [
      { label: 'Due', get: function (r) { return r.daysUntilDue < 0 ? Math.abs(r.daysUntilDue) + ' days overdue' : r.daysUntilDue === 0 ? 'Today' : 'In ' + r.daysUntilDue + (r.daysUntilDue === 1 ? ' day' : ' days'); } },
      { label: 'Brand', get: brand },
      { label: 'Customer', get: function (r) { return r.customerName || 'Not given'; } },
      { label: 'Postcode', get: function (r) { return r.postcode || ''; } },
      { label: 'Units', numeric: true, get: function (r) { return U.num(r.unitCount); } },
      { label: 'Reminded', get: function (r) { return r.lastContactedOn || 'Not yet'; } },
      { label: 'Open', sr: true, get: function (r) { return r.jobId ? link('/staff/quoted.html#job-' + r.jobId, 'Open') : ''; } }
    ], d.services, { empty: 'No services falling due in the next month.', onRow: function (tr, r) { if (r.daysUntilDue < 0) tr.className = 'is-stale'; } });

    var money = ['p-owed', 'p-ready', 'p-drifted'];
    money.forEach(function (id) { el(id).hidden = !d.money; });
    if (!d.money) return;

    U.table(el('owed'), [
      { label: 'Job date', get: function (r) { return r.jobDate ? new Date(r.jobDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''; } },
      { label: 'Brand', get: brand },
      { label: 'Customer', get: function (r) { return r.customerName || 'Not given'; } },
      { label: 'Postcode', get: function (r) { return r.postcode || ''; } },
      { label: 'Owed', numeric: true, get: function (r) { return U.money(r.owedPence); } },
      { label: 'Open', sr: true, get: open }
    ], d.owed, { empty: 'Nobody owes anything on finished work.' });

    U.table(el('ready'), [
      { label: 'Job date', get: function (r) { return when(r.jobDate); } },
      { label: 'Brand', get: brand },
      { label: 'Customer', get: function (r) { return r.customerName || 'Not given'; } },
      { label: 'Invoice', numeric: true, get: function (r) { return U.money(r.invoicePence); } },
      { label: 'To pay out', numeric: true, get: function (r) { return U.money(r.owedPence) + ' to ' + r.owedRows; } },
      { label: 'Open', sr: true, get: open }
    ], d.ready, { empty: 'Nothing paid in full is waiting to be frozen.' });

    U.table(el('drifted'), [
      { label: 'Frozen', get: function (r) { return U.when(r.frozenAt); } },
      { label: 'Brand', get: brand },
      { label: 'Customer', get: function (r) { return r.customerName || 'Not given'; } },
      { label: 'Invoice', numeric: true, get: function (r) { return U.money(r.invoicePence); } },
      { label: 'Would now be', numeric: true, get: function (r) { return (r.driftPence < 0 ? '' : '+') + U.money(r.driftPence); } },
      { label: 'Open', sr: true, get: open }
    ], d.drifted, { empty: 'Every frozen figure still matches its lines.' });
  }

  async function refresh() {
    try {
      var data = await U.get('/api/admin/due' + (state.site ? '?site=' + state.site : ''));
      state.data = data;
      render(data);
      el('state').hidden = true;
      el('content').hidden = false;
    } catch (e) {
      el('state').textContent = e.message || 'Could not load.';
      el('state').hidden = false;
    }
  }

  document.querySelectorAll('[data-site]').forEach(function (pill) {
    pill.addEventListener('click', function () {
      state.site = pill.dataset.site;
      document.querySelectorAll('[data-site]').forEach(function (p) { p.setAttribute('aria-pressed', String(p === pill)); });
      refresh();
    });
  });
  U.scopePills('[data-site]');
  el('refresh').addEventListener('click', refresh);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });
  refresh();
})(window);
