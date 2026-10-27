/* My hours as a calendar: tap the days you can work (or Weekdays, Weekends),
   then tap a time and those days are saved straight away. The usual week
   below fills every future day by itself; a day set on the calendar keeps
   what was picked. Stored by lib/hours-store.js. A manager can pick whose. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ORDER = [1, 2, 3, 4, 5, 6, 0];
  var PRESETS = [['09:00', '17:00', 'All day', '9 to 5'], ['09:00', '13:00', 'Morning', '9 to 1'], ['13:00', '17:00', 'Afternoon', '1 to 5'], ['17:00', '19:00', 'Evening', '5 to 7']];
  var TIMES = [];
  for (var m = 7 * 60; m <= 21 * 60; m += 30) TIMES.push((m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 ? '30' : '00'));
  var WEEKS = 6;
  var who = new URLSearchParams(location.search).get('surveyor'), data = null, picked = {};

  function iso(d) { return d.toISOString().slice(0, 10); }
  function dow(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }
  function nice(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function short(t) { var h = Number(t.slice(0, 2)), mm = t.slice(3); h = h > 12 ? h - 12 : h; return h + (mm === '00' ? '' : ':' + mm); }
  function span(w) { return short(w.start) + '-' + short(w.end); }
  function btn(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function select(value, name) {
    var s = document.createElement('select'); s.setAttribute('aria-label', name);
    TIMES.forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = t; if (t === value) o.selected = true; s.appendChild(o); });
    return s;
  }
  function today() { var t = new Date(); t.setUTCHours(12, 0, 0, 0); return t; }
  /* Days from tomorrow: today is already planned. */
  function days() {
    var t = today(), start = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000), out = [];
    for (var i = 0; i < WEEKS * 7; i += 1) out.push(iso(new Date(start.getTime() + i * 86400000)));
    return out;
  }
  var first = function () { return iso(new Date(today().getTime() + 86400000)); };

  async function send(body, said) {
    el('note').textContent = 'Saving.';
    var r = await U.send('/api/admin/hours', Object.assign({ surveyor: who }, body));
    el('note').textContent = r.ok ? (said || 'Saved.') : (r.data && r.data.error) || 'That did not save.';
    await load();
    return r;
  }

  /* Sets the ticked days, then clears the ticks so the calendar shows the result. */
  async function apply(action, start, end, label) {
    var list = Object.keys(picked);
    if (!list.length) { el('note').textContent = 'Tap the days first.'; return; }
    var r = await send({ op: 'bulk', action: action, dates: list, start: start, end: end },
      list.length + (list.length === 1 ? ' day ' : ' days ') + label + '.');
    if (r.ok) { picked = {}; render(); }
  }

  function renderBar() {
    var n = Object.keys(picked).length;
    el('bar-count').textContent = n ? n + (n === 1 ? ' day picked: now tap their hours' : ' days picked: now tap their hours') : 'Tap the days you can work, then pick the hours.';
    el('bar').classList.toggle('is-ready', n > 0);
    el('bar-times').querySelectorAll('button').forEach(function (b) { b.disabled = !n; });
  }

  function renderCal() {
    var cal = el('cal'); cal.textContent = '';
    ORDER.forEach(function (d) { cal.appendChild(U.node('span', 'cal-head', DAYS[d])); });
    var from = first();
    days().forEach(function (d) {
      var mine = data.hours.filter(function (h) { return h.date === d; });
      var past = d < from;
      var cell = U.node('button', 'cal-day' + (past ? ' is-past' : mine.length ? ' is-on' : ' is-off') + (picked[d] ? ' is-picked' : ''));
      cell.type = 'button'; cell.disabled = past;
      cell.setAttribute('aria-pressed', picked[d] ? 'true' : 'false');
      var n = Number(d.slice(8));
      cell.appendChild(U.node('span', 'cal-num', n === 1 || d === days()[0] ? n + ' ' + new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : String(n)));
      cell.appendChild(U.node('span', 'cal-when', past ? '' : mine.length ? mine.map(span).join(', ') : 'Off'));
      cell.setAttribute('aria-label', nice(d) + ': ' + (mine.length ? mine.map(function (h) { return h.start + ' to ' + h.end; }).join(', ') : 'not available'));
      cell.addEventListener('click', function () { if (picked[d]) delete picked[d]; else picked[d] = true; render(); });
      cal.appendChild(cell);
    });
  }

  function renderUsual() {
    var list = el('usual'); list.textContent = '';
    el('learn-row').hidden = data.usual.length > 0 || !data.hours.some(function (h) { return h.source === 'set'; });
    ORDER.forEach(function (d) {
      var mine = data.usual.filter(function (u) { return Number(u.weekday) === d; });
      var li = U.node('li', 'hrs-row');
      li.appendChild(U.node('span', 'hrs-name', LONG[d]));
      li.appendChild(U.node('span', 'hrs-now' + (mine.length ? '' : ' is-off'), mine.length ? mine.map(function (u) { return u.start + ' to ' + u.end; }).join(', ') : 'Off'));
      var row = U.node('div', 'hrs-quick');
      PRESETS.forEach(function (p) {
        var on = mine.length === 1 && mine[0].start === p[0] && mine[0].end === p[1];
        var b = btn(p[2], 'chip' + (on ? ' is-on' : ''), function () { send({ op: 'set_usual', weekdays: [d], windows: [{ start: p[0], end: p[1] }] }, LONG[d] + 's: ' + p[3] + '.'); });
        row.appendChild(b);
      });
      row.appendChild(btn('Off', 'chip' + (mine.length ? '' : ' is-on'), function () { send({ op: 'set_usual', weekdays: [d], windows: [] }, LONG[d] + 's: off.'); }));
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function render() { renderCal(); renderBar(); }

  /* The quick times, the custom from and to, and the day pickers: built once. */
  (function bar() {
    var times = el('bar-times');
    PRESETS.forEach(function (p) {
      var b = btn('', 'chip chip--big', function () { apply('replace', p[0], p[1], 'set to ' + p[3]); });
      b.appendChild(U.node('b', null, p[2])); b.appendChild(U.node('span', null, p[3]));
      times.appendChild(b);
    });
    times.appendChild(btn('Not available', 'chip chip--big is-off', function () { apply('off', null, null, 'marked off'); }));
    times.appendChild(btn('My usual week', 'chip chip--big', function () { apply('usual', null, null, 'back to the usual week'); }));
    var own = el('bar-own'), a = select('08:00', 'From'), z = select('18:00', 'To');
    own.appendChild(U.node('span', null, 'Or from')); own.appendChild(a); own.appendChild(U.node('span', null, 'to')); own.appendChild(z);
    own.appendChild(btn('Set', 'btn btn--sm', function () { apply('replace', a.value, z.value, 'set to ' + a.value + ' to ' + z.value); }));
    own.appendChild(btn('Add as extra', null, function () { apply('add', a.value, z.value, 'given ' + a.value + ' to ' + z.value + ' extra'); }));
    document.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-pick'), from = first();
        picked = {};
        if (kind !== 'none') days().forEach(function (d) { var w = dow(d); if (d >= from && (kind === 'weekends' ? (w === 0 || w === 6) : (w > 0 && w < 6))) picked[d] = true; });
        render();
      });
    });
  })();
  el('learn').addEventListener('click', function () { send({ op: 'learn' }); });

  async function load() {
    try {
      var t = today(), start = iso(new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000));
      var end = iso(new Date(Date.parse(start + 'T12:00:00Z') + (WEEKS * 7 - 1) * 86400000));
      data = await U.get('/api/admin/hours?from=' + start + '&to=' + end + (who ? '&surveyor=' + who : ''));
      if (who === null) who = data.me;
      if (data.manager && el('who').options.length === 0) {
        data.surveyors.forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s.charAt(0).toUpperCase() + s.slice(1); el('who').appendChild(o); });
        el('who-row').hidden = false;
      }
      if (who) el('who').value = who;
      if (data.note) { el('note').textContent = who && data.manager ? 'Pick whose hours to set.' : data.note; return; }
      render(); renderUsual();
    } catch (e) { if (e.message !== 'unauthorised') el('note').textContent = 'Could not load your hours.'; }
  }

  el('who').addEventListener('change', function () { who = el('who').value; picked = {}; load(); });
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
