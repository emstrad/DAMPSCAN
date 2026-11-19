/* Jobs and earnings: state, loading and the read-only views.
   The form, the live split preview and the rate card editor are in
   job-form.js, which also fires the first load once both files are parsed.

   Pounds are typed and displayed; whole pence are all that cross the wire, so
   no fraction ever reaches the arithmetic. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var listeners = [];

  var state = { site: '', range: 'all', rates: [], settings: null, jobs: [], leads: [], totals: null };

  var PEOPLE = [
    { key: 'scott', name: 'Scott' },
    { key: 'tom', name: 'Tom' },
    { key: 'ben', name: 'Ben' }
  ];
  /* Surveys for his fee and is not a partner: a tile only once he has earned. */
  var RONNIE = { key: 'ronnie', name: 'Ronnie' };

  function name(key) {
    for (var i = 0; i < PEOPLE.length; i += 1) if (PEOPLE[i].key === key) return PEOPLE[i].name;
    if (key === RONNIE.key) return RONNIE.name;
    return key;
  }

  function label(key) {
    for (var i = 0; i < state.rates.length; i += 1) if (state.rates[i].key === key) return state.rates[i].label;
    return key ? key : 'One off';
  }

  /* ---------- views ---------- */
  function renderTiles(totals) {
    var mount = el('tiles');
    mount.textContent = '';
    PEOPLE.concat(totals.pay.ronnie ? [RONNIE] : []).forEach(function (p) {
      var d = U.node('div', 'tile is-key');
      d.appendChild(U.node('span', 'k', p.name));
      d.appendChild(U.node('span', 'v', U.money(totals.pay[p.key])));
      mount.appendChild(d);
    });
    var work = el('tiles-work');
    work.textContent = '';
    [['Surveys done', U.num(totals.done), U.money(totals.surveyValuePence)],
      ['Paid in full', U.num(totals.paid), null],
      ['Still to be paid', U.num(totals.unpaid), totals.unpaid ? U.money(totals.unpaidValuePence) : null, totals.unpaid ? 'is-warn' : ''],
      ['Booked ahead', U.num(totals.bookedAhead), totals.bookedAhead ? U.money(totals.aheadValuePence) : null],
      ['Remedial won', U.money(totals.remedialValuePence), null]].forEach(function (t) {
      var d = U.node('div', 'tile' + (t[3] ? ' ' + t[3] : ''));
      d.appendChild(U.node('span', 'k', t[0]));
      d.appendChild(U.node('span', 'v', t[1]));
      if (t[2]) d.appendChild(U.node('span', 's', t[2]));
      work.appendChild(d);
    });

    var s = state.settings;
    var sh = s.shares;
    el('basis').textContent = 'Tax set aside ' + (s.taxBp / 100) + '%, then '
      + (sh ? 'the surveyor fee, then the rest split Scott ' + sh.scott / 100 + '%, Tom ' + sh.tom / 100 + '%, Ben ' + sh.ben / 100 + '%'
        : 'a ' + (s.leadBp / 100) + '% lead fee to ' + name(s.leadEarner) + ' on the post-tax figure, then the surveyor fee, then the remainder split 50/50 between '
        + name(s.partners[0]) + ' and ' + name(s.partners[1]))
      + '. Earnings count surveys whose day has come; booked ahead is shown on its own. Cancelled jobs are listed but not counted.';
  }

  /* A row per job that reads on a phone: who, when, what, and the split. */
  function renderJobs(onEdit) {
    var mount = el('jobs');
    mount.textContent = '';
    if (!state.jobs.length) { mount.appendChild(U.node('p', 'empty', 'No jobs in this period.')); return; }
    var list = U.node('ul', 'jobs-list');
    state.jobs.forEach(function (j) {
      var li = U.node('li', 'jobs-row' + (j.status === 'cancelled' ? ' is-cancelled' : ''));
      var top = U.node('div', 'jobs-top');
      top.appendChild(U.node('span', 'jobs-who', (j.customerName || 'Not given') + (j.customerPostcode ? ', ' + j.customerPostcode : '')));
      top.appendChild(U.node('span', 'jobs-price', U.money(j.surveyPricePence) + (j.remedialPence ? ' + ' + U.money(j.remedialPence) : '')));
      li.appendChild(top);
      var day = new Date(String(j.jobDate).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      li.appendChild(U.node('p', 'jobs-meta', [day, label(j.surveyType), name(j.surveyor), j.site === 'ati-london' ? 'ATi' : 'DampScan'].join(' · ')));
      var foot = U.node('div', 'jobs-foot');
      var tone = j.status === 'cancelled' ? ' tag--muted' : j.status === 'completed' || j.status === 'paid' ? ' tag--good' : '';
      foot.appendChild(U.node('span', 'tag' + tone, j.status));
      foot.appendChild(U.node('span', 'jobs-split', ['Scott ' + U.money(j.pay.scott), 'Tom ' + U.money(j.pay.tom), 'Ben ' + U.money(j.pay.ben)].join(' · ')));
      var edit = U.node('button', 'pill', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () { onEdit(j); });
      foot.appendChild(edit);
      li.appendChild(foot);
      list.appendChild(li);
    });
    mount.appendChild(list);
  }

  /* ---------- loading ---------- */
  async function refresh() {
    var qs = '?range=' + state.range + (state.site ? '&site=' + state.site : '');
    try {
      var rates = await U.get('/api/admin/rates');
      state.rates = rates.rates.filter(function (r) { return r.active; });
      state.settings = rates.settings;

      var data = await U.get('/api/admin/jobs' + qs);
      state.jobs = data.jobs;
      state.totals = data.totals;

      var leads = await U.get('/api/admin/leads?range=all&stage=complete&limit=200');
      state.leads = leads.leads || [];

      renderTiles(data.totals);
      listeners.forEach(function (fn) { fn(); });

      el('state').hidden = true;
      el('content').hidden = false;
    } catch (e) {
      el('state').textContent = e.message || 'Could not load jobs.';
      el('state').hidden = false;
    }
  }

  function pills(selector, key) {
    document.querySelectorAll(selector).forEach(function (pill) {
      pill.addEventListener('click', function () {
        state[key] = pill.dataset[key];
        document.querySelectorAll(selector).forEach(function (p) {
          p.setAttribute('aria-pressed', String(p === pill));
        });
        refresh();
      });
    });
  }

  pills('[data-site]', 'site');
  U.scopePills('[data-site]');
  pills('[data-range]', 'range');

  el('refresh').addEventListener('click', refresh);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });

  el('csv').addEventListener('click', function () {
    U.downloadCsv('jobs-' + state.range + '.csv', [
      ['Date', function (j) { return String(j.jobDate).slice(0, 10); }],
      ['Customer', function (j) { return j.customerName || ''; }],
      ['Postcode', function (j) { return j.customerPostcode || ''; }],
      ['Site', function (j) { return j.site; }],
      ['Survey', function (j) { return label(j.surveyType); }],
      ['Price', function (j) { return (j.surveyPricePence / 100).toFixed(2); }],
      ['Remedial', function (j) { return (j.remedialPence / 100).toFixed(2); }],
      ['Surveyor', function (j) { return name(j.surveyor); }],
      ['Scott', function (j) { return (j.pay.scott / 100).toFixed(2); }],
      ['Tom', function (j) { return (j.pay.tom / 100).toFixed(2); }],
      ['Ben', function (j) { return (j.pay.ben / 100).toFixed(2); }],
      ['Status', function (j) { return j.status; }],
      ['Note', function (j) { return j.note || ''; }]
    ], state.jobs);
  });

  global.DSJOBS = {
    state: state,
    PEOPLE: PEOPLE,
    name: name,
    label: label,
    refresh: refresh,
    renderJobs: renderJobs,
    /** job-form.js registers here so it re-renders whenever fresh data lands. */
    onData: function (fn) { listeners.push(fn); }
  };
})(window);
