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

  var state = { site: '', range: '30d', rates: [], settings: null, jobs: [], leads: [], totals: null };

  var PEOPLE = [
    { key: 'scott', name: 'Scott' },
    { key: 'tom', name: 'Tom' },
    { key: 'ben', name: 'Ben' }
  ];

  function name(key) {
    for (var i = 0; i < PEOPLE.length; i += 1) if (PEOPLE[i].key === key) return PEOPLE[i].name;
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
    PEOPLE.forEach(function (p) {
      var d = U.node('div', 'tile is-key');
      d.appendChild(U.node('span', 'k', p.name));
      d.appendChild(U.node('span', 'v', U.money(totals.pay[p.key])));
      mount.appendChild(d);
    });
    [['Jobs', U.num(totals.jobs)],
      ['Survey value', U.money(totals.surveyValuePence)],
      ['Remedial value', U.money(totals.remedialValuePence)]].forEach(function (pair) {
      var d = U.node('div', 'tile');
      d.appendChild(U.node('span', 'k', pair[0]));
      d.appendChild(U.node('span', 'v', pair[1]));
      mount.appendChild(d);
    });

    var s = state.settings;
    el('basis').textContent = 'Tax set aside ' + (s.taxBp / 100) + '%, then a '
      + (s.leadBp / 100) + '% lead fee to ' + name(s.leadEarner)
      + ' on the post-tax figure, then the surveyor fee, then the remainder '
      + 'split 50/50 between ' + name(s.partners[0]) + ' and ' + name(s.partners[1])
      + '. Cancelled jobs are listed but not counted. Remedial work pays the lead '
      + 'fee only; materials and labour are settled offline.';
  }

  function renderJobs(onEdit) {
    U.table(el('jobs'), [
      { label: 'Date', get: function (j) { return String(j.jobDate).slice(0, 10); } },
      { label: 'Customer', get: function (j) { return j.customerName || 'Not given'; } },
      { label: 'Survey', get: function (j) { return label(j.surveyType); } },
      { label: 'Price', numeric: true, get: function (j) { return U.money(j.surveyPricePence); } },
      { label: 'Remedial', numeric: true, get: function (j) { return j.remedialPence ? U.money(j.remedialPence) : ''; } },
      { label: 'Surveyor', get: function (j) { return name(j.surveyor); } },
      { label: 'Scott', numeric: true, get: function (j) { return U.money(j.pay.scott); } },
      { label: 'Tom', numeric: true, get: function (j) { return U.money(j.pay.tom); } },
      { label: 'Ben', numeric: true, get: function (j) { return U.money(j.pay.ben); } },
      { label: 'Status', get: function (j) {
        var tone = j.status === 'cancelled' ? ' tag--muted' : j.status === 'completed' ? ' tag--good' : '';
        return U.node('span', 'tag' + tone, j.status);
      } },
      { label: '', get: function (j) {
        var edit = U.node('button', 'pill', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', function () { onEdit(j); });
        return edit;
      } }
    ], state.jobs, { empty: 'No jobs in this period.' });
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
