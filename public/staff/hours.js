/* My hours: the usual week, set once and used every week, then the next five
   weeks day by day. Tick days (or Weekdays, Weekends, All) and set, add,
   clear or reset them together. Presets cover the common shapes; any time can
   still be picked. Stored by lib/hours-store.js. A manager can pick whose. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ORDER = [1, 2, 3, 4, 5, 6, 0];
  var PRESETS = [['09:00', '17:00', 'All day 9 to 5'], ['09:00', '13:00', 'Morning 9 to 1'], ['13:00', '17:00', 'Afternoon 1 to 5'], ['17:00', '19:00', 'Evening 5 to 7']];
  var TIMES = [];
  for (var m = 7 * 60; m <= 21 * 60; m += 30) TIMES.push((m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 ? '30' : '00'));
  var who = null, data = null, picked = {};

  function iso(d) { return d.toISOString().slice(0, 10); }
  function dow(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }
  function label(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function select(value, name) {
    var s = document.createElement('select'); s.setAttribute('aria-label', name);
    TIMES.forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = t; if (t === value) o.selected = true; s.appendChild(o); });
    return s;
  }
  /* A preset menu plus from and to: picking a preset fills both. */
  function timePicker(start, end) {
    var box = U.node('div', 'hrs-time');
    var p = document.createElement('select'); p.setAttribute('aria-label', 'Preset');
    [['', 'Pick a preset']].concat(PRESETS.map(function (x) { return [x[0] + '-' + x[1], x[2]]; })).forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; p.appendChild(o); });
    var a = select(start, 'From'), b = select(end, 'To');
    p.addEventListener('change', function () { if (p.value) { var t = p.value.split('-'); a.value = t[0]; b.value = t[1]; } });
    box.appendChild(p); box.appendChild(a); box.appendChild(U.node('span', null, 'to')); box.appendChild(b);
    return { node: box, from: a, to: b };
  }
  function btn(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  async function send(body) {
    var r = await U.send('/api/admin/hours', Object.assign({ surveyor: who }, body));
    el('note').textContent = r.ok ? 'Saved.' : (r.data && r.data.error) || 'That did not save.';
    await load();
    return r;
  }

  function renderUsual() {
    var list = el('usual'); list.textContent = '';
    el('learn-row').hidden = data.usual.length > 0 || !data.hours.some(function (h) { return h.source === 'set'; });
    ORDER.forEach(function (d) {
      var mine = data.usual.filter(function (u) { return Number(u.weekday) === d; });
      var li = U.node('li', 'hrs-row');
      li.appendChild(U.node('span', 'hrs-name', DAYS[d]));
      var wins = U.node('div', 'hrs-wins');
      if (!mine.length) wins.appendChild(U.node('span', 'panel-note', 'Not available'));
      mine.forEach(function (u) {
        var chip = U.node('span', 'tag', u.start + ' to ' + u.end + ' ');
        chip.appendChild(btn('Remove', 'link-btn', function () {
          send({ op: 'set_usual', weekdays: [d], windows: mine.filter(function (x) { return x !== u; }) });
        }));
        wins.appendChild(chip);
      });
      li.appendChild(wins);
      var t = timePicker('09:00', '17:00');
      var add = U.node('div', 'hrs-add'); add.appendChild(t.node);
      add.appendChild(btn('Add', 'btn btn--sm', function () { send({ op: 'set_usual', weekdays: [d], windows: mine.concat([{ start: t.from.value, end: t.to.value }]) }); }));
      add.appendChild(btn('Same as Monday', null, function () {
        send({ op: 'set_usual', weekdays: [d], windows: data.usual.filter(function (u) { return Number(u.weekday) === 1; }) });
      }));
      li.appendChild(add);
      list.appendChild(li);
    });
  }

  function renderDays() {
    var list = el('days'); list.textContent = '';
    var start = new Date(); start.setUTCHours(12, 0, 0, 0);
    for (var i = 1; i <= 35; i += 1) {
      var d = iso(new Date(start.getTime() + i * 86400000));
      var mine = data.hours.filter(function (h) { return h.date === d; });
      var hand = mine.some(function (h) { return h.source === 'set'; }) || (data.setDays || []).indexOf(d) >= 0;
      var li = U.node('li', 'hrs-day' + (picked[d] ? ' is-picked' : '') + (mine.length ? '' : ' is-off'));
      var box = document.createElement('input'); box.type = 'checkbox'; box.checked = Boolean(picked[d]); box.id = 'd-' + d;
      (function (day) { box.addEventListener('change', function () { if (box.checked) picked[day] = true; else delete picked[day]; renderDays(); renderBulk(); }); })(d);
      var lab = document.createElement('label'); lab.htmlFor = box.id;
      lab.appendChild(U.node('span', 'hrs-date', label(d)));
      lab.appendChild(U.node('span', 'hrs-when', mine.length ? mine.map(function (h) { return h.start + ' to ' + h.end; }).join(', ') : 'Not available'));
      lab.appendChild(U.node('span', 'hrs-src', mine.some(function (h) { return h.source === 'set'; }) ? 'changed' : mine.length ? 'usual' : ''));
      li.appendChild(box); li.appendChild(lab);
      list.appendChild(li);
    }
  }

  var bulkTime = null;
  function renderBulk() {
    var n = Object.keys(picked).length;
    el('bulk').hidden = !n;
    el('bulk-count').textContent = n + (n === 1 ? ' day ticked' : ' days ticked');
    if (!bulkTime) { bulkTime = timePicker('09:00', '17:00'); el('bulk-times').appendChild(bulkTime.node); }
  }
  document.querySelectorAll('[data-act]').forEach(function (b) {
    b.addEventListener('click', async function () {
      var r = await send({ op: 'bulk', action: b.getAttribute('data-act'), dates: Object.keys(picked), start: bulkTime.from.value, end: bulkTime.to.value });
      if (r.ok) { picked = {}; renderDays(); renderBulk(); }
    });
  });
  document.querySelectorAll('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-pick');
      picked = {};
      if (kind !== 'none') {
        var start = new Date(); start.setUTCHours(12, 0, 0, 0);
        for (var i = 1; i <= 35; i += 1) {
          var d = iso(new Date(start.getTime() + i * 86400000)); var w = dow(d);
          if (kind === 'all' || (kind === 'weekends' ? (w === 0 || w === 6) : (w > 0 && w < 6))) picked[d] = true;
        }
      }
      renderDays(); renderBulk();
    });
  });
  el('learn').addEventListener('click', function () { send({ op: 'learn' }); });

  async function load() {
    try {
      data = await U.get('/api/admin/hours' + (who ? '?surveyor=' + who : ''));
      if (who === null) who = data.me;
      if (data.manager && el('who').options.length === 0) {
        data.surveyors.forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s.charAt(0).toUpperCase() + s.slice(1); el('who').appendChild(o); });
        el('who-row').hidden = false;
      }
      if (who) el('who').value = who;
      if (data.note && !who) { el('note').textContent = 'Pick whose hours to set.'; return; }
      renderUsual(); renderDays(); renderBulk();
    } catch (e) { if (e.message !== 'unauthorised') el('note').textContent = 'Could not load your hours.'; }
  }

  el('who').addEventListener('change', function () { who = el('who').value; picked = {}; load(); });
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
