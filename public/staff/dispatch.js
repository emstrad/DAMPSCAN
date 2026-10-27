/* The dispatch day on the Scheduling page: a week strip to pick the day, then
   one lane per surveyor working it, top to bottom in time order: their hours,
   each survey (tap for the full job, with paid, report and the rest), the
   drive to the next one, anything pencilled in (grey), and the free starts
   left. Drop a card from the board onto a free start, or tap the start, to
   pencil in or book. Lanes sit side by side on a wide screen, stacked on a
   phone. Drawn from data the board already loads (lib/dispatch.js). */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  var toMin = function (t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
  function nice(d, opts) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts)); }
  function addDays(d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }

  function stageOf(s) {
    if (s.reportSent) return ['Report sent', 'is-done'];
    if (s.paid) return ['Paid, report to send', 'is-paid'];
    if (s.status === 'completed') return ['Surveyed, not paid', 'is-owed'];
    if (s.awaitingAgent) return ['Waiting on the agent', 'is-wait'];
    return [s.deposit ? 'Booked, deposit paid' : 'Booked, no deposit', 'is-booked'];
  }

  function strip(mount, d, opts) {
    var row = U.node('div', 'dsp-week');
    var prev = U.node('button', 'btn btn--ghost btn--sm', '←'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous week');
    prev.addEventListener('click', function () { opts.go(addDays(d.week[0].date, -7), addDays(d.week[0].date, -7)); });
    row.appendChild(prev);
    d.week.forEach(function (w) {
      var b = U.node('button', 'dsp-daybtn' + (w.date === d.day.date ? ' is-on' : '') + (w.date === opts.today ? ' is-today' : ''));
      b.type = 'button';
      b.appendChild(U.node('span', 'dsp-dow', nice(w.date, { weekday: 'short' })));
      b.appendChild(U.node('span', 'dsp-num', nice(w.date, { day: 'numeric' })));
      b.appendChild(U.node('span', 'dsp-count', w.surveys + (w.surveys === 1 ? ' survey' : ' surveys') + (w.pencilled ? ', ' + w.pencilled + ' held' : '')));
      b.setAttribute('aria-label', nice(w.date, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + w.surveys + ' surveys');
      b.addEventListener('click', function () { opts.go(w.date, d.week[0].date); });
      row.appendChild(b);
    });
    var next = U.node('button', 'btn btn--ghost btn--sm', '→'); next.type = 'button'; next.setAttribute('aria-label', 'Next week');
    next.addEventListener('click', function () { opts.go(addDays(d.week[0].date, 7), addDays(d.week[0].date, 7)); });
    row.appendChild(next);
    mount.appendChild(row);
  }

  function item(cls, time, title, sub) {
    var b = U.node('button', 'dsp-item ' + cls); b.type = 'button';
    b.appendChild(U.node('span', 'dsp-time', time || 'No time'));
    var m = U.node('span', 'dsp-main');
    m.appendChild(U.node('span', 'dsp-title', title));
    if (sub) m.appendChild(U.node('span', 'dsp-sub', sub));
    b.appendChild(m);
    return b;
  }

  function lane(l, date, opts) {
    var box = U.node('section', 'dsp-lane');
    box.appendChild(U.node('h3', null, cap(l.surveyor)));
    if (l.home) box.appendChild(U.node('p', 'dsp-hours', 'From ' + l.home.area + (l.home.toFirst != null ? ', ' + l.home.toFirst + ' min to the first survey' : '') + (l.home.fromLast != null ? ', ' + l.home.fromLast + ' min home after the last' : '')));
    box.appendChild(U.node('p', 'dsp-hours', l.hours.length ? 'Hours ' + l.hours.map(function (h) { return h.start + ' to ' + h.end; }).join(', ') : 'No hours set'));
    var rows = [];
    l.surveys.forEach(function (s) {
      rows.push({ at: s.time ? toMin(s.time) : -1, draw: function () {
        var st = stageOf(s);
        var b = item('is-survey ' + st[1], s.time, (s.name || 'No name') + (s.postcode ? ', ' + s.postcode : ''), [s.label, st[0]].filter(Boolean).join(' · '));
        b.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(s.id, { onChange: opts.reload }); });
        return b;
      } });
      if (s.driveNext && s.time) rows.push({ at: toMin(s.time) + 59, draw: function () {
        return U.node('p', 'dsp-drive', 'About ' + s.driveNext.minutes + ' min drive to ' + (s.driveNext.to || 'the next survey') + (s.driveNext.known ? '' : ' (postcode unknown, an hour allowed)'));
      } });
    });
    l.pencils.forEach(function (p) {
      rows.push({ at: toMin(p.time), draw: function () {
        var b = item('is-pencil', p.time, 'Pencilled: ' + (p.customerName || 'No name') + (p.postcode ? ', ' + p.postcode : ''),
          (p.sharing.length ? 'Also offered to ' + p.sharing.join(', ') : 'Not confirmed') + (p.by ? ' · by ' + p.by : ''));
        b.addEventListener('click', function () { opts.focusCard(p.of, p.id); });
        return b;
      } });
    });
    l.free.forEach(function (t) {
      rows.push({ at: toMin(t), draw: function () {
        var b = item('is-free', t, 'Free', 'Tap to pencil in or book, or drop a card here');
        var slot = { date: date, time: t, surveyor: l.surveyor };
        b.addEventListener('click', function () { opts.book(null, slot); });
        b.addEventListener('dragover', function (e) { e.preventDefault(); b.classList.add('is-over'); });
        b.addEventListener('dragleave', function () { b.classList.remove('is-over'); });
        b.addEventListener('drop', function (e) { e.preventDefault(); b.classList.remove('is-over'); opts.dropOn(e.dataTransfer.getData('text/plain'), slot); });
        return b;
      } });
    });
    rows.sort(function (a, b) { return a.at - b.at; }).forEach(function (r) { box.appendChild(r.draw()); });
    if (!rows.length) box.appendChild(U.node('p', 'panel-note', 'Nothing booked and no free time.'));
    return box;
  }

  function render(mount, d, opts) {
    mount.textContent = '';
    strip(mount, d, opts);
    mount.appendChild(U.node('h2', 'dsp-title-day', nice(d.day.date, { weekday: 'long', day: 'numeric', month: 'long' }) + (d.day.date === opts.today ? ' · Today' : '')));
    var lanes = U.node('div', 'dsp-lanes');
    if (!d.day.lanes.length) lanes.appendChild(U.node('p', 'panel-note', 'Nobody is working this day: no surveys and no hours set on My hours.'));
    d.day.lanes.forEach(function (l) { lanes.appendChild(lane(l, d.day.date, opts)); });
    lanes.style.setProperty('--lanes', String(Math.max(1, d.day.lanes.length)));
    mount.appendChild(lanes);
  }

  global.DSDISPATCH = { render: render };
})(window);
