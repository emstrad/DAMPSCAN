/* Today: a timeline first. One week, Monday at the top to Sunday at the
   bottom, each day's jobs in time order (jobs with a day but no hour sit under
   "Time to confirm" on their day), today highlighted, arrows or a sideways
   swipe for the week before or after. Tapping a job opens its pop-up
   (calendar-pop.js) with everything about it and every action on it.

   Under the timeline, two short lists and nothing else: "Not booked in yet"
   (agreed work with no date anybody chose; a job's date defaults to the day
   it was typed in, so date_set on the server tells the two apart) and "Needs
   doing" with only three groups: collect a deposit, collect payment in full,
   send a survey report. The whole outstanding list lives on the Due page.

   A month grid is still there behind a toggle for looking further ahead.
   Jobs move by dragging in the month grid on a desktop, or from the pop-up. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var W = global.DSWORK;
  var el = function (id) { return document.getElementById(id); };
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  var VIEW_KEY = 'ds_cal_view2';
  var stored = function () { try { return global.localStorage.getItem(VIEW_KEY); } catch (e) { return null; } };
  var qs = new URLSearchParams(location.search);
  var state = { view: stored() === 'month' ? 'month' : 'week', cursor: today, area: ['damp', 'roofing', 'ac'].indexOf(qs.get('area')) !== -1 ? qs.get('area') : '',
    events: [], unbooked: [], work: null };
  /* The three groups Today lists, each built from the server's groups. */
  var NEEDS = [['deposit', 'Collect deposit', ['deposits']], ['paid', 'Collect paid in full', ['payments', 'invoices']], ['report', 'Send survey report', ['reports']],
    /* CoolRight only, and only when a unit's warranty ends within 60 days. */
    ['warranty', 'Warranty ending', ['warranty']]];

  function at(iso) { return new Date(iso + 'T12:00:00Z'); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = at(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function monday(s) { return addDays(s, -((at(s).getUTCDay() + 6) % 7)); }
  function fmt(s, o) { return at(s).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o)); }

  function range() {
    if (state.view === 'week') return { from: monday(state.cursor), to: addDays(monday(state.cursor), 6) };
    var first = state.cursor.slice(0, 7) + '-01';
    var next = at(first); next.setUTCMonth(next.getUTCMonth() + 1);
    return { from: monday(first), to: addDays(monday(addDays(iso(next), -1)), 6) };
  }
  function title() {
    var r = range();
    if (state.view === 'month') return fmt(state.cursor, { month: 'long', year: 'numeric' });
    return fmt(r.from, { day: 'numeric', month: 'short' }) + ' to ' + fmt(r.to, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  var popOpts = { work: function () { return state.work; }, onChange: function () { return load(); } };
  function open(e) {
    /* A service on a plan made from a job opens that job's pop-up, plan and kit included. */
    if (e.kind === 'service' && !e.jobId) { location.href = '/staff/' + (e.site === 'ac' ? 'service.html?area=ac' : 'quoted.html?area=' + e.site); return; }
    global.DSPOP.open(e.jobId || e.id, popOpts);
  }
  function outstanding(e) {
    var n = 0;
    ((state.work && state.work.groups) || []).forEach(function (g) { g.items.forEach(function (i) { if (i.jobId === e.id) n++; }); });
    return e.kind === 'job' ? n : 0;
  }

  /* One job on the timeline: a button, so it is a tap target, never a stripe of colour. */
  function jobButton(e, compact) {
    var b = U.node('button', 'tl-job' + (e.status === 'completed' || e.status === 'paid' ? ' is-done' : '') + (e.kind === 'service' ? ' is-service' : '') + (compact ? ' tl-job--compact' : ''));
    b.type = 'button';
    if (!compact) b.appendChild(U.node('span', 'tl-time', e.time || (e.kind === 'service' ? 'Due' : '')));
    var main = U.node('span', 'tl-main');
    main.appendChild(U.node('span', 'tl-who', (compact && e.time ? e.time + ' ' : '') + (e.kind === 'service' ? 'Service: ' : '') + [e.customerName || 'No name', e.postcode].filter(Boolean).join(', ')));
    /* Survey type and who is going, so the day reads at a glance. */
    var kind = [e.surveyLabel, e.surveyor && e.surveyor.charAt(0).toUpperCase() + e.surveyor.slice(1)].filter(Boolean).join(' · ');
    if (kind) main.appendChild(U.node('span', 'tl-biz tl-kind', kind));
    if (e.todoCount && global.DSTODOS) main.appendChild(global.DSTODOS.tag(e.todoCount));
    if (!compact && e.phone) main.appendChild(U.node('span', 'tl-biz', e.phone));
    main.appendChild(U.node('span', 'tl-biz', W.NAME[e.site] + (e.status && e.kind === 'job' ? ' · ' + e.status : '')));
    b.appendChild(main);
    var n = outstanding(e);
    if (n) { var c = U.node('span', 'tl-count', String(n)); c.setAttribute('aria-label', n + ' outstanding'); b.appendChild(c); }
    b.addEventListener('click', function (ev) { ev.stopPropagation(); open(e); });
    if (compact && e.kind === 'job' && e.status !== 'paid') {
      b.draggable = true;
      b.addEventListener('dragstart', function (ev) { ev.dataTransfer.setData('text/plain', String(e.id)); });
    }
    return b;
  }

  function draw(e, compact) { return e.kind === 'pencil' ? global.DSPENCIL.button(e, compact) : jobButton(e, compact); }

  function onTimeline(e) { return e.kind !== 'job' || e.dateSet !== false; }
  function byDay() {
    var map = {};
    state.events.filter(onTimeline).concat(state.pencils || []).forEach(function (e) { (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }

  function drawWeek(mount) {
    var r = range();
    var days = byDay();
    var wrap = U.node('div', 'tl');
    var shown = 0;
    for (var d = r.from; d <= r.to; d = addDays(d, 1)) {
      /* An empty day is hidden, except today, so the week reads as what is on. */
      if (!(days[d] || []).length && d !== today) continue;
      shown += 1;
      var list = (days[d] || []).slice().sort(function (a, b) { return String(a.time || '').localeCompare(String(b.time || '')); });
      var box = U.node('section', 'tl-day' + (d === today ? ' is-today' : '') + (d < today ? ' is-past' : ''));
      var h = U.node('h3', 'tl-head');
      h.appendChild(U.node('span', 'tl-dow', fmt(d, { weekday: 'long' })));
      h.appendChild(U.node('span', 'tl-date', fmt(d, { day: 'numeric', month: 'short' }) + (d === today ? ' · Today' : '')));
      box.appendChild(h);
      var timed = list.filter(function (e) { return e.time || e.kind === 'service'; });
      var tbc = list.filter(function (e) { return !e.time && e.kind === 'job'; });
      timed.forEach(function (e) { box.appendChild(draw(e)); });
      if (tbc.length) {
        box.appendChild(U.node('p', 'tl-sub', 'Time to confirm'));
        tbc.forEach(function (e) { box.appendChild(jobButton(e)); });
      }
      if (!list.length) box.appendChild(U.node('p', 'tl-empty', 'Nothing booked'));
      wrap.appendChild(box);
    }
    if (!shown) wrap.appendChild(U.node('p', 'tl-empty', 'Nothing booked this week.'));
    mount.appendChild(wrap);
  }

  function drawMonth(mount) {
    var r = range();
    var days = byDay();
    var grid = U.node('div', 'cal');
    DOW.forEach(function (d) { grid.appendChild(U.node('div', 'cal-dow', d)); });
    for (var d = r.from; d <= r.to; d = addDays(d, 1)) {
      var cell = U.node('div', 'cal-day' + (d.slice(0, 7) !== state.cursor.slice(0, 7) ? ' is-out' : '') + (d === today ? ' is-today' : ''));
      var num = U.node('button', 'cal-num', String(Number(d.slice(8))));
      num.type = 'button';
      num.setAttribute('aria-label', 'Week of ' + fmt(d, { day: 'numeric', month: 'long' }));
      num.addEventListener('click', function (date) { state.view = 'week'; state.cursor = date; remember(); load(); }.bind(null, d));
      cell.appendChild(num);
      (days[d] || []).forEach(function (e) { cell.appendChild(draw(e, true)); });
      drop(cell, d);
      grid.appendChild(cell);
    }
    mount.appendChild(grid);
  }
  function drop(node, date) {
    node.addEventListener('dragover', function (ev) { ev.preventDefault(); node.classList.add('is-target'); });
    node.addEventListener('dragleave', function () { node.classList.remove('is-target'); });
    node.addEventListener('drop', function (ev) {
      ev.preventDefault();
      node.classList.remove('is-target');
      var e = state.events.find(function (x) { return x.kind === 'job' && x.id === Number(ev.dataTransfer.getData('text/plain')); });
      if (!e || e.date === date) return;
      var path = '/api/admin/' + (e.quoted ? 'quoted' : 'clients'), body = W.moveBody({ jobId: e.id, quoted: e.quoted, status: e.status }, date, e.time);
      /* Inside the drive to or from another survey: say so, and only go ahead if asked. */
      U.send(path, body).then(function (r) { return r && r.data && r.data.clash && global.confirm(r.data.clash.replace(' Send force to book it anyway.', '') + ' Move it anyway?') ? U.send(path, Object.assign({}, body, { force: true })) : null; }).then(load);
    });
  }

  function listRow(e, what) {
    var li = U.node('li');
    var b = U.node('button', 'tl-job tl-job--row');
    b.type = 'button';
    var main = U.node('span', 'tl-main');
    main.appendChild(U.node('span', 'tl-who', [e.customerName || e.firstName || 'No name', e.postcode].filter(Boolean).join(', ')));
    main.appendChild(U.node('span', 'tl-biz', W.NAME[e.site] + (what ? ' · ' + what : '')));
    b.appendChild(main);
    b.addEventListener('click', function () { global.DSPOP.open(e.jobId || e.id, popOpts); });
    li.appendChild(b);
    return li;
  }

  function drawLists() {
    var ub = el('unbooked');
    ub.textContent = '';
    el('unbooked-count').textContent = state.unbooked.length ? String(state.unbooked.length) : '';
    if (!state.unbooked.length) ub.appendChild(U.node('p', 'panel-note', 'Everything agreed has a date.'));
    state.unbooked.forEach(function (e) { ub.appendChild(listRow(e, e.status === 'quoted' ? 'quote accepted' : 'booked, no date')); });

    var mount = el('needs');
    mount.textContent = '';
    var groups = (state.work && state.work.groups) || [];
    var total = 0;
    NEEDS.forEach(function (n) {
      var items = [];
      groups.filter(function (g) { return n[2].indexOf(g.key) !== -1; }).forEach(function (g) { items = items.concat(g.items); });
      if (!items.length) return;
      total += items.length;
      var box = U.node('section', 'needs-group');
      var h = U.node('h3', null, n[1]);
      h.appendChild(U.node('span', 'act-count', String(items.length)));
      box.appendChild(h);
      var ul = U.node('ul', 'tl-list');
      items.forEach(function (it) { ul.appendChild(listRow(it, (it.owedPence ? U.money(it.owedPence) + ' · ' : '') + it.what)); });
      box.appendChild(ul);
      mount.appendChild(box);
    });
    if (!total) mount.appendChild(U.node('p', 'panel-note', 'No deposits, payments or reports waiting.'));
  }

  function render() {
    el('title').textContent = title();
    document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view)); });
    document.querySelectorAll('[data-area-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-area-filter') === state.area)); });
    var mount = el('cal-view');
    mount.textContent = '';
    if (state.view === 'month') drawMonth(mount); else drawWeek(mount);
    drawLists();
  }

  async function load() {
    var r = range();
    try {
      var data = await U.get('/api/admin/calendar?view=work&from=' + r.from + '&to=' + r.to + (state.area ? '&area=' + state.area : ''));
      state.events = data.events || [];
      state.pencils = data.pencils || [];
      state.unbooked = data.unbooked || [];
      state.work = data.work;
      el('state').hidden = true;
      el('content').hidden = false;
      render();
    } catch (e) {
      el('state').hidden = false;
      el('state').textContent = e.message || 'Could not load.';
    }
  }
  function remember() { try { global.localStorage.setItem(VIEW_KEY, state.view); } catch (e) { /* private mode */ } }
  function shift(n) {
    if (state.view === 'week') state.cursor = addDays(state.cursor, 7 * n);
    else { var d = at(state.cursor.slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + n); state.cursor = iso(d); }
    load();
  }

  /* A clear sideways swipe on the timeline is the next or previous week; a
     mostly vertical one is the page scrolling and is left alone. */
  var touch = null;
  el('cal-view').addEventListener('touchstart', function (ev) { var t = ev.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
  el('cal-view').addEventListener('touchend', function (ev) {
    if (!touch) return;
    var t = ev.changedTouches[0];
    var dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) shift(dx < 0 ? 1 : -1);
  }, { passive: true });

  function ics() {
    var esc = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n'); };
    var stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Staff area//Calendar//EN', 'CALSCALE:GREGORIAN'];
    state.events.filter(onTimeline).forEach(function (e) {
      lines.push('BEGIN:VEVENT', 'UID:' + e.kind + '-' + e.id + '-' + e.date + '@staff', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(e.date, 1).replace(/-/g, ''),
        'SUMMARY:' + esc(W.NAME[e.site] + ': ' + (e.time ? e.time + ' ' : '') + [e.customerName, e.postcode].filter(Boolean).join(', ')), 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    a.download = 'calendar-' + range().from + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); remember(); load(); });
  });
  document.querySelectorAll('[data-area-filter]').forEach(function (b) {
    b.addEventListener('click', function () { state.area = b.getAttribute('data-area-filter'); load(); });
  });
  el('prev').addEventListener('click', function () { shift(-1); });
  el('next').addEventListener('click', function () { shift(1); });
  el('today').addEventListener('click', function () { state.cursor = today; load(); });
  el('ics').addEventListener('click', ics);
  el('refresh').addEventListener('click', load);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });
  /* Company filters for the companies this person holds; one company needs none. */
  U.get('/api/admin/me').catch(function () { return null; }).then(function (me) {
    if (!me || !me.businesses) return;
    var held = me.businesses.map(function (b) { return W.AREA_OF[b.slug]; });
    /* Who's free opens Scheduling, which is for whoever manages a damp brand. */
    el('who-free').hidden = !me.businesses.some(function (b) { return W.AREA_OF[b.slug] === 'damp' && b.level === 'manage'; });
    document.querySelectorAll('[data-area-filter]').forEach(function (b) {
      var a = b.getAttribute('data-area-filter');
      if (a && held.indexOf(a) === -1) b.remove();
    });
    if (document.querySelectorAll('[data-area-filter]').length <= 2) el('filters').hidden = true;
  });
  global.DSTODAY = { refresh: load };
  load();
})(window);
