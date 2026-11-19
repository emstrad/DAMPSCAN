/* Estate agents who arrange surveys: how many, when last, and the surveys
   waiting on them for a time, each with a one-tap chase in the agent's own
   WhatsApp, Messages or email. Top agents over the last twelve months first.
   For the owners, each agent's own page and booking link, when they last
   opened it, and Add an agent (the owner, 19 Nov 2026: one place for an agent;
   company-agents.js draws them, Growth keeps the figures and statements). */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var S = global.DSSV;
  var el = function (id) { return document.getElementById(id); };
  var data = null;
  var pages = {};
  var BRANDS = [['ati-london', 'ATi'], ['dampscan', 'DampScan']];

  function chase(id, slot) {
    return S.button('Chase for a time', async function () {
      slot.textContent = 'Loading…';
      var d = await U.get('/api/admin/surveys?view=messages&id=' + id);
      slot.textContent = '';
      if (d.messages.chase) slot.appendChild(S.message(d.messages.chase));
    }, 'act-main');
  }

  function card(a) {
    var c = U.node('article', 'ag-card');
    var top = U.node('div', 'card-top');
    top.appendChild(U.node('span', 'card-name', a.name + (a.branch ? ', ' + a.branch : '')));
    top.appendChild(U.node('span', 'act-biz', a.jobs + ' survey' + (a.jobs === 1 ? '' : 's')));
    c.appendChild(top);
    c.appendChild(U.node('p', 'card-meta', [a.yearJobs + ' in the last 12 months', a.lastJob ? 'last ' + S.shortDate(a.lastJob) : ''].filter(Boolean).join(' · ')));
    var bar = U.node('div', 'card-actions');
    if (a.phone) bar.appendChild(S.link('Call', S.tel(a.phone)));
    if (a.email) bar.appendChild(S.link('Email', 'mailto:' + a.email));
    if (bar.children.length) c.appendChild(bar);
    var mine = pages[a.id];
    if (mine && global.DSAGENTS) {
      var d = document.createElement('details'); d.className = 'pay-surveys ag-links';
      var s = document.createElement('summary'); s.className = 'c-row';
      s.innerHTML = '<span class="c-l"><b>Their page and links</b><small></small></span><span class="c-r"><span class="c-chev">›</span></span>';
      s.querySelector('small').textContent = (mine.seen ? 'Opened ' + S.shortDate(String(mine.seen).slice(0, 10)) : 'Never opened') + ' · ' + S.BRAND[mine.site];
      d.appendChild(s); d.appendChild(global.DSAGENTS.links(mine));
      c.appendChild(d);
    }
    if (a.waiting.length) {
      c.appendChild(U.node('p', 'sv-badge sv-badge--agent', a.waiting.length + ' waiting on a time'));
      a.waiting.forEach(function (w) {
        var row = U.node('div', 'ag-wait');
        row.appendChild(U.node('p', null, [w.name, w.street].filter(Boolean).join(', ') + ' (' + S.BRAND[w.site] + ')'));
        var slot = U.node('div');
        var acts = U.node('div', 'card-actions');
        acts.appendChild(chase(w.id, slot));
        acts.appendChild(S.link('Open', '/staff/surveys.html?area=damp#job-' + w.id));
        row.appendChild(acts);
        row.appendChild(slot);
        c.appendChild(row);
      });
    }
    return c;
  }

  function draw() {
    var q = el('ag-q').value.trim().toLowerCase();
    var list = el('ag-list');
    list.textContent = '';
    /* Agents added before they sent anyone have a page but no surveys yet. */
    var known = data.agents.map(function (a) { return a.id; });
    var all = data.agents.concat(Object.keys(pages).map(Number).filter(function (id) { return known.indexOf(id) === -1; })
      .map(function (id) { var p = pages[id]; return { id: id, name: p.name, branch: p.branch, phone: p.phone, email: p.email, jobs: 0, yearJobs: 0, lastJob: null, waiting: [] }; }));
    var shown = all.filter(function (a) { return !q || (a.name + ' ' + (a.branch || '')).toLowerCase().indexOf(q) !== -1; });
    shown.forEach(function (a) { list.appendChild(card(a)); });
    if (!shown.length) list.appendChild(U.node('p', 'panel-note', all.length ? 'No agent matches that.' : 'No estate agents yet. Add one when booking a survey, under "Booked through an estate agent?".'));
  }

  /* The owners' view of each brand's agents (lib/agent-referrals.js); anyone else simply has no links. */
  async function loadPages() {
    pages = {};
    await Promise.all(BRANDS.map(async function (b) {
      try { (await U.get('/api/admin/pay?view=agents&site=' + b[0])).agents.forEach(function (a) { pages[a.id] = Object.assign({ site: b[0] }, a); }); } catch (e) { /* not an owner */ }
    }));
    var add = el('ag-add'); add.textContent = '';
    if (global.DSAGENTS && Object.keys(pages).length) BRANDS.forEach(function (b) { add.appendChild(global.DSAGENTS.addForm(b[0], load, 'Add an agent for ' + b[1])); });
  }

  async function load() {
    try {
      await loadPages();
      data = await U.get('/api/admin/surveys?view=agents');
      var top = el('top');
      top.textContent = '';
      if (data.top.length) {
        top.appendChild(U.node('h2', null, 'Top agents, last 12 months'));
        var ol = U.node('ol', 'sv-toplist');
        data.top.forEach(function (a) { ol.appendChild(U.node('li', null, a.name + (a.branch ? ', ' + a.branch : '') + ': ' + a.yearJobs)); });
        top.appendChild(ol);
      }
      el('state').hidden = true;
      el('content').hidden = false;
      draw();
    } catch (e) { el('state').textContent = 'Could not load the agents. ' + e.message; }
  }

  el('ag-q').addEventListener('input', draw);
  var refresh = el('refresh');
  if (refresh) refresh.addEventListener('click', load);
  load();
})(window);
