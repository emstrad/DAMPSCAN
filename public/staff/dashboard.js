/* DampScan staff dashboard. Plain DOM, no framework and no build step.
   Every number here is aggregated by Postgres. This file only renders and paginates.
   Rendering primitives live in ui.js (window.DSUI). */
(function dashboard(){
  'use strict';

  var node = DSUI.node, num = DSUI.num, pct = DSUI.pct, when = DSUI.when;
  var table = DSUI.table, get = DSUI.get;

  var state = { range: '7d', site: '', stage: '', offset: 0, limit: 50, summary: null, leads: null };

  var PLACEMENTS = {
    header: 'Header', 'mobile-bar': 'Mobile bar', closing: 'Closing CTA',
    footer: 'Footer', page: 'In page'
  };

  function el(id){ return document.getElementById(id); }

  /* ---------- headline tiles ---------- */
  function renderTiles(c){
    var tiles = [
      { k: 'Page views', v: num(c.pageViews) },
      { k: 'Unique sessions', v: num(c.sessions) },
      { k: 'Call clicks', v: num(c.callClicks) },
      { k: 'Form opens', v: num(c.formOpens) },
      { k: 'Step 1 dropouts', v: num(c.partials) },
      { k: 'Bookings', v: num(c.bookings), key: true },
      { k: 'Dropout rate', v: pct(c.sessionToPartial), s: num(c.partials) + ' of ' + num(c.sessions) + ' sessions' },
      { k: 'Session to booking', v: pct(c.sessionToBooking), s: num(c.bookings) + ' of ' + num(c.sessions) + ' sessions', key: true }
    ];
    var mount = el('tiles');
    mount.textContent = '';
    tiles.forEach(function(t){
      var d = node('div', 'tile' + (t.key ? ' is-key' : ''));
      d.appendChild(node('span', 'k', t.k));
      d.appendChild(node('span', 'v', t.v));
      if (t.s) d.appendChild(node('span', 's', t.s));
      mount.appendChild(d);
    });
  }

  /* ---------- funnel and the fields that cost leads ---------- */
  function renderFunnel(f){
    var mount = el('funnel');
    mount.textContent = '';
    var top = Math.max(f.step1, f.step2, f.step3, f.submitted, 1);
    [
      { label: 'Step 1', value: f.step1, drop: null },
      { label: 'Step 2', value: f.step2, drop: f.dropStep1To2 },
      { label: 'Step 3', value: f.step3, drop: f.dropStep2To3 },
      { label: 'Submitted', value: f.submitted, drop: f.dropStep3ToSubmit }
    ].forEach(function(r){
      var row = node('div', 'frow');
      row.appendChild(node('span', null, r.label + ' (' + num(r.value) + ')'));
      var bar = node('div', 'fbar');
      var fill = node('span');
      fill.style.width = Math.round((r.value / top) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(node('span', 'fdrop', r.drop === null ? '' : '-' + pct(r.drop) + ' drop'));
      mount.appendChild(row);
    });

    table(el('form-errors'), [
      { label: 'Field', get: function(r){ return r.field; } },
      { label: 'Errors', numeric: true, get: function(r){ return num(r.errors); } },
      { label: 'Sessions affected', numeric: true, get: function(r){ return num(r.sessions); } }
    ], f.errorsByField, { empty: 'No validation errors. No field is costing you leads.' });
  }

  /* ---------- call log ---------- */
  function renderCalls(calls){
    table(el('calls'), [
      { label: 'When', get: function(r){ return when(r.createdAt); } },
      { label: 'Placement', get: function(r){ return PLACEMENTS[r.placement] || r.placement; } },
      { label: 'Device', get: function(r){ return r.device; } },
      { label: 'Channel', get: function(r){ return r.channel; } },
      { label: 'Booked after', get: function(r){
          return node('span', 'tag ' + (r.booked ? 'tag--good' : 'tag--muted'), r.booked ? 'Yes' : 'No');
        } }
    ], calls.rows, { empty: 'No calls in this period.' });

    if (calls.truncated) {
      el('calls').appendChild(node('p', 'panel-note',
        'Showing the most recent ' + calls.limit + ' calls. There are older ones in this range.'));
    }
  }

  /* ---------- source, landing page and device breakdowns ---------- */
  function renderBreakdown(mount, rows, keyLabel){
    table(mount, [
      { label: keyLabel, get: function(r){ return r.key; } },
      { label: 'Sessions', numeric: true, get: function(r){ return num(r.sessions); } },
      { label: 'Calls', numeric: true, get: function(r){ return num(r.callClicks); } },
      { label: 'Bookings', numeric: true, get: function(r){ return num(r.bookings); } },
      { label: 'Booking rate', numeric: true, get: function(r){
          return node('span', 'tag ' + (r.bookings > 0 ? 'tag--accent' : 'tag--muted'), pct(r.bookingRate));
        } }
    ], rows);
  }

  /* ---------- load ---------- */
  async function load(){
    el('state').hidden = false;
    el('state').textContent = 'Loading…';
    el('content').hidden = true;

    var leadQuery = '/api/admin/leads?range=' + state.range
      + '&limit=' + state.limit + '&offset=' + state.offset
      + (state.stage ? '&stage=' + state.stage : '')
      + (state.site ? '&site=' + state.site : '');

    try {
      var results = await Promise.all([
        get('/api/admin/summary?range=' + state.range + (state.site ? '&site=' + state.site : '')),
        get(leadQuery)
      ]);
      state.summary = results[0];
      state.leads = results[1];

      if (state.summary.viewer) {
        el('who').textContent = 'Signed in as ' + (state.summary.viewer.name || state.summary.viewer.email);
      }
      renderTiles(state.summary.counters);
      renderFunnel(state.summary.funnel);
      renderCalls(state.summary.calls);
      renderBreakdown(el('src-channel'), state.summary.sources.byChannel, 'Channel');
      renderBreakdown(el('src-referrer'), state.summary.sources.byReferrer, 'Referrer host');
      renderBreakdown(el('src-campaign'), state.summary.sources.byCampaign, 'Campaign');
      renderBreakdown(el('landing'), state.summary.landingPages, 'Landing page');
      renderBreakdown(el('devices'), state.summary.devices, 'Device');
      DSLEADS.render(state.leads);

      el('state').hidden = true;
      el('content').hidden = false;
    } catch (err) {
      if (err.message === 'unauthorised') return;   // already redirecting
      el('state').textContent = 'Could not load the dashboard. ' + err.message;
    }
  }

  /* ---------- controls ---------- */
  function group(selector, apply){
    var buttons = document.querySelectorAll(selector);
    buttons.forEach(function(btn){
      btn.addEventListener('click', function(){
        buttons.forEach(function(b){ b.setAttribute('aria-pressed', String(b === btn)); });
        apply(btn);
        state.offset = 0;
        load();
      });
    });
  }

  group('[data-range]', function(btn){ state.range = btn.dataset.range; });
  group('[data-site]', function(btn){ state.site = btn.dataset.site; });
  group('[data-stage]', function(btn){ state.stage = btn.dataset.stage; });

  el('prev').addEventListener('click', function(){
    state.offset = Math.max(0, state.offset - state.limit);
    load();
  });
  el('next').addEventListener('click', function(){
    state.offset += state.limit;
    load();
  });
  el('refresh').addEventListener('click', load);
  el('csv').addEventListener('click', function(){
    DSLEADS.exportCsv(state.range, state.leads && state.leads.leads);
  });

  el('logout').addEventListener('click', async function(){
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.replace('/staff');
  });

  load();
})();
