/* DampScan staff dashboard. Plain DOM, no framework and no build step.
   Every number here is aggregated by Postgres. This file only renders and paginates.
   Rendering primitives live in ui.js (window.DSUI). */
(function dashboard(){
  'use strict';

  var node = DSUI.node, num = DSUI.num, pct = DSUI.pct, when = DSUI.when;
  var table = DSUI.table, get = DSUI.get;

  var state = { range: '7d', stage: '', offset: 0, limit: 50, summary: null, leads: null };

  var PLACEMENTS = {
    header: 'Header', 'mobile-bar': 'Mobile bar', closing: 'Closing CTA',
    footer: 'Footer', page: 'In page'
  };
  var LEAD_COLUMN_COUNT = 14;

  function el(id){ return document.getElementById(id); }

  /* ---------- headline tiles ---------- */
  function renderTiles(c){
    var tiles = [
      { k: 'Page views', v: num(c.pageViews) },
      { k: 'Unique sessions', v: num(c.sessions) },
      { k: 'Call clicks', v: num(c.callClicks) },
      { k: 'Form opens', v: num(c.formOpens) },
      { k: 'Step 1 partials', v: num(c.partials) },
      { k: 'Bookings', v: num(c.bookings), key: true },
      { k: 'Session to partial', v: pct(c.sessionToPartial), s: num(c.partials) + ' of ' + num(c.sessions) + ' sessions' },
      { k: 'Partial to booked', v: pct(c.partialToComplete), s: num(c.bookings) + ' of ' + num(c.partials) + ' partials', key: true }
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

  /* ---------- one lead's event timeline, shown when its row is expanded ---------- */
  function timelineRow(lead){
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = LEAD_COLUMN_COUNT;
    td.className = 'timeline';

    if (!lead.timeline.length) {
      td.appendChild(node('p', 'empty', 'No events recorded for this session.'));
    } else {
      var ol = document.createElement('ol');
      lead.timeline.forEach(function(ev){
        var li = document.createElement('li');
        li.appendChild(node('time', null, when(ev.createdAt)));
        var bits = [ev.type];
        if (ev.detail && Object.keys(ev.detail).length) {
          bits.push(Object.keys(ev.detail).map(function(k){ return k + '=' + ev.detail[k]; }).join(' '));
        }
        if (ev.channel) bits.push('via ' + ev.channel);
        li.appendChild(document.createTextNode(' ' + bits.join(' · ')));
        ol.appendChild(li);
      });
      td.appendChild(ol);
    }
    tr.appendChild(td);
    return tr;
  }

  function expandable(tr, lead){
    tr.className = 'is-clickable';
    tr.tabIndex = 0;
    tr.setAttribute('aria-expanded', 'false');
    var detail = null;

    function toggle(){
      if (detail) {
        detail.remove();
        detail = null;
        tr.setAttribute('aria-expanded', 'false');
        return;
      }
      detail = timelineRow(lead);
      tr.parentNode.insertBefore(detail, tr.nextSibling);
      tr.setAttribute('aria-expanded', 'true');
    }

    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  var LEAD_COLUMNS = [
    { label: 'When', get: function(r){ return when(r.createdAt); } },
    { label: 'Stage', get: function(r){
        return node('span', 'tag ' + (r.stage === 'complete' ? 'tag--good' : 'tag--muted'),
          r.stage === 'complete' ? 'Booked' : 'Partial');
      } },
    { label: 'Name', get: function(r){ return r.firstName; } },
    { label: 'Email', get: function(r){ return r.email; } },
    { label: 'Phone', get: function(r){ return r.phone; } },
    { label: 'Postcode', get: function(r){ return r.postcode; } },
    { label: 'Issues', wrap: true, get: function(r){ return (r.issues || []).join(', '); } },
    { label: 'Role', get: function(r){ return r.role; } },
    { label: 'Previous survey', get: function(r){
        return r.previousSurvey === null ? 'Not asked' : r.previousSurvey ? 'Yes' : 'No';
      } },
    { label: 'Channel', get: function(r){ return r.channel || 'unknown'; } },
    { label: 'Landing page', get: function(r){ return r.landingPage; } },
    { label: 'Campaign', get: function(r){ return r.utm && r.utm.utm_campaign; } },
    { label: 'Notes', wrap: true, get: function(r){ return r.notes; } },
    { label: 'Emailed', get: function(r){
        if (r.notifiedAt) return node('span', 'tag tag--good', 'Sent');
        return node('span', 'tag tag--muted', r.notifyError ? 'Failed' : 'Pending');
      } }
  ];

  function renderLeads(data){
    table(el('leads'), LEAD_COLUMNS, data.leads, {
      empty: 'No leads in this period.',
      onRow: function(tr, lead){ expandable(tr, lead); }
    });

    var shown = data.leads.length;
    el('page-info').textContent = shown
      ? 'Showing ' + (data.offset + 1) + ' to ' + (data.offset + shown) + ' of ' + num(data.total)
      : 'No rows';
    el('prev').disabled = data.offset <= 0;
    el('next').disabled = data.offset + shown >= data.total;
  }

  /* ---------- CSV export of the current page of leads ---------- */
  var CSV_COLUMNS = [
    ['id', function(l){ return l.id; }],
    ['created_at', function(l){ return l.createdAt; }],
    ['stage', function(l){ return l.stage; }],
    ['first_name', function(l){ return l.firstName; }],
    ['email', function(l){ return l.email; }],
    ['phone', function(l){ return l.phone; }],
    ['postcode', function(l){ return l.postcode; }],
    ['issues', function(l){ return (l.issues || []).join('; '); }],
    ['role', function(l){ return l.role; }],
    ['previous_survey', function(l){ return l.previousSurvey === null ? '' : l.previousSurvey ? 'Yes' : 'No'; }],
    ['notes', function(l){ return l.notes; }],
    ['channel', function(l){ return l.channel; }],
    ['landing_page', function(l){ return l.landingPage; }],
    ['referrer', function(l){ return l.referrer; }],
    ['utm_source', function(l){ return l.utm && l.utm.utm_source; }],
    ['utm_medium', function(l){ return l.utm && l.utm.utm_medium; }],
    ['utm_campaign', function(l){ return l.utm && l.utm.utm_campaign; }],
    ['device', function(l){ return l.device; }],
    ['session_id', function(l){ return l.sessionId; }],
    ['notified_at', function(l){ return l.notifiedAt; }]
  ];

  function exportCsv(){
    if (!state.leads || !state.leads.leads.length) return;
    var name = 'dampscan-leads-' + state.range + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    DSUI.downloadCsv(name, CSV_COLUMNS, state.leads.leads);
  }

  /* ---------- load ---------- */
  async function load(){
    el('state').hidden = false;
    el('state').textContent = 'Loading…';
    el('content').hidden = true;

    var leadQuery = '/api/admin/leads?range=' + state.range
      + '&limit=' + state.limit + '&offset=' + state.offset
      + (state.stage ? '&stage=' + state.stage : '');

    try {
      var results = await Promise.all([
        get('/api/admin/summary?range=' + state.range),
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
      renderLeads(state.leads);

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

  group('.ranges .pill', function(btn){ state.range = btn.dataset.range; });
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
  el('csv').addEventListener('click', exportCsv);

  el('logout').addEventListener('click', async function(){
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.replace('/staff');
  });

  load();
})();
