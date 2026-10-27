/* DampScan staff dashboard. Plain DOM, no framework and no build step.
   Every number here is aggregated by Postgres. This file only renders and paginates.
   Rendering primitives live in ui.js (window.DSUI). */
(function dashboard(){
  'use strict';

  var node = DSUI.node, num = DSUI.num, pct = DSUI.pct, when = DSUI.when;
  var table = DSUI.table, get = DSUI.get;

  var state = { range: '7d', site: '', stage: '', status: 'all', offset: 0, limit: 50, summary: null, leads: null };

  var PLACEMENTS = {
    header: 'Header', 'mobile-bar': 'Mobile bar', closing: 'Closing CTA',
    footer: 'Footer', page: 'In page'
  };

  function el(id){ return document.getElementById(id); }

  /* ---------- the boxes that cost bookings ---------- */
  function renderErrors(f){
    table(el('form-errors'), [
      { label: 'Box', get: function(r){ return r.field; } },
      { label: 'People', numeric: true, get: function(r){ return num(r.sessions); } }
    ], f.errorsByField, { empty: 'Nobody got a box wrong. The form is not losing anyone here.' });
  }

  /* ---------- call log ---------- */
  function renderCalls(calls){
    var mount = el('calls');
    mount.textContent = '';
    if (!calls.rows.length) { mount.appendChild(node('p', 'empty', 'Nobody tapped to call in this period.')); return; }
    var list = node('ul', 'dash-calls');
    calls.rows.slice(0, 10).forEach(function(r){
      var li = node('li');
      li.appendChild(node('span', 'dash-bar-name', when(r.createdAt)));
      li.appendChild(node('span', 'dash-bar-did', [(window.DSDASH.DEVICE[r.device] || r.device), 'from the ' + (PLACEMENTS[r.placement] || r.placement).toLowerCase() + ' button', window.DSDASH.CHANNEL[r.channel] || r.channel].filter(Boolean).join(' · ')));
      if (r.booked) li.appendChild(node('span', 'tag tag--good', 'Booked later'));
      list.appendChild(li);
    });
    mount.appendChild(list);

    if (calls.truncated) {
      el('calls').appendChild(node('p', 'panel-note',
        'Showing the most recent ' + calls.limit + ' calls. There are older ones in this range.'));
    }
  }

  /* ---------- load ---------- */
  async function load(){
    el('state').hidden = false;
    el('state').textContent = 'Loading…';
    el('content').hidden = true;

    var leadQuery = '/api/admin/leads?range=' + state.range
      + '&limit=' + state.limit + '&offset=' + state.offset
      + (state.stage ? '&stage=' + state.stage : '')
      + '&status=' + state.status
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
      var D = window.DSDASH, sum = state.summary;
      el('sentence').textContent = D.story(sum, state.range);
      D.tiles(el('tiles'), sum);
      var tips = D.tips(sum);
      el('tips').textContent = '';
      tips.forEach(function (t) { el('tips').appendChild(node('li', null, t)); });
      el('tips-panel').hidden = !tips.length;
      D.funnel(el('funnel'), sum.funnel);
      renderErrors(sum.funnel);
      renderCalls(sum.calls);
      var same = function (k) { return k; };
      D.bars(el('src-channel'), sum.sources.byChannel, function (k) { return D.CHANNEL[k] || k; });
      D.bars(el('src-referrer'), sum.sources.byReferrer, same, { limit: 8 });
      D.bars(el('src-campaign'), sum.sources.byCampaign, same);
      el('campaign-more').hidden = !(sum.sources.byCampaign || []).length;
      D.bars(el('landing'), sum.landingPages, D.pageName, { limit: 8 });
      if (window.DSOUTCOMES) window.DSOUTCOMES.render(el('outcomes'), sum.outcomes);
      D.bars(el('devices'), sum.devices, function (k) { return D.DEVICE[k] || k; });
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
  /* window, not global: this file is not wrapped in a function handed the
     global object, and reaching for one that is not there threw before the
     first load, which left the whole page on "Loading" with no leads. */
  (window.DSUI || {}).scopePills && window.DSUI.scopePills('[data-site]');
  group('[data-stage]', function(btn){ state.stage = btn.dataset.stage; });
  group('[data-status]', function(btn){ state.status = btn.dataset.status; });
  /* A close, reopen or delete on a row reloads the page of leads. */
  DSLEADS.onChange = load;

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
