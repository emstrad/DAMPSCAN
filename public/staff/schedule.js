/* Scheduling: the four columns before and up to booking. Cards drag between
   columns on a desktop; on a phone the "Move to" box does the same. Every
   change goes to /api/admin/scheduling, which checks the person's access. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var COLS = [['new', 'New enquiry'], ['contacted', 'Contacted'], ['waiting', 'Waiting for time']];
  var HOW = [['call', 'Called'], ['email', 'Emailed'], ['text', 'Texted'], ['note', 'Note']];
  var data = null;
  var booking = null;
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function ago(iso) {
    var m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)), h = Math.round(m / 60);
    return m < 60 ? m + ' min ago' : h < 48 ? h + 'h ago' : Math.round(h / 24) + ' days ago';
  }

  /* After a change the card is brought into view, wherever its column now is. */
  var focusAfter = null;
  async function act(body, said) {
    var r = await U.send('/api/admin/scheduling', body);
    el('note').textContent = r.ok ? (said || '') : (r.data && r.data.error) || 'That did not save.';
    if (r.ok) { focusAfter = body.kind && body.id ? body.kind + '-' + body.id : null; load(); }
    return r;
  }

  function button(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function card(c) {
    var box = U.node('article', 'sched-card');
    box.id = c.kind + '-' + c.id;
    box.draggable = true;
    box.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.kind + ':' + c.id); });
    /* A tap on the card itself (not its buttons or boxes) opens the full customer card. */
    box.addEventListener('click', function (e) { if (!e.target.closest('button,a,input,select,textarea,summary,details,label')) global.DSSCHEDCARD.open(c, { act: act, book: openBook }); });
    box.appendChild(U.node('h3', null, c.name || 'No name'));
    box.appendChild(U.node('p', 'meta', [c.street, c.postcode].filter(Boolean).join(', ') || 'No address yet'));
    if (c.phone) { var a = U.node('a', 'sched-phone', c.phone); a.href = 'tel:' + c.phone; box.appendChild(a); }
    /* Where contact stands, in one short line: the latest call, email or note,
       or how long it has waited with nobody in touch. */
    var last = c.log.length ? c.log[c.log.length - 1] : null;
    var brand = c.site === 'ati-london' ? 'ATi' : 'DampScan';
    box.appendChild(U.node('p', 'sched-status' + (last ? '' : ' is-cold'), brand + ' · ' + (last
      ? (HOW.find(function (h) { return h[0] === last.how; }) || ['', 'Note'])[1] + ' ' + ago(last.at) + ' by ' + last.by
      : 'nobody in touch yet, ' + ago(c.since).replace(' ago', '') + ' waiting')));
    /* A tap opens everything else: notes, history, times to offer, Book, Move to. */
    var flags = [];
    if (c.awaitingAgent) flags.push('Waiting on ' + (c.agent || 'the agent'));
    if (c.deadline) flags.push('Report by ' + c.deadline);
    if (c.chose) flags.push(c.chose.unsure ? 'Not sure which survey' : c.chose.name);
    if (c.wanted) flags.push('Wants ' + c.wanted);
    if (c.pencil) flags.push('Pencilled ' + day(c.pencil.date) + ' ' + c.pencil.time);
    if (c.held) flags.push('Picked a time online');
    if ((c.same || []).length) flags.push('Same person on another card');
    if ((c.best || []).length && !c.pencil) flags.push('Best: ' + day(c.best[0].date) + ' ' + c.best[0].time + ' ' + cap(c.best[0].surveyor));
    if (flags.length) box.appendChild(U.node('p', 'sched-flags', flags.join(' · ')));
    return box;
  }

  function column(key, title, cards) {
    var col = U.node('section', 'sched-col');
    var h = U.node('h2', null, title); h.appendChild(U.node('span', 'tag', String(cards.length)));
    col.appendChild(h);
    if (key) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('is-over'); });
      col.addEventListener('dragleave', function () { col.classList.remove('is-over'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('is-over');
        var p = e.dataTransfer.getData('text/plain').split(':');
        if (key === 'booked') { var c = data.cards.find(function (x) { return x.kind === p[0] && x.id === Number(p[1]); }); if (c) openBook(c, null); return; }
        act({ op: 'move', kind: p[0], id: Number(p[1]), to: key });
      });
    }
    cards.forEach(function (c) { col.appendChild(card(c)); });
    return col;
  }

  /* Needs you now: the few customers who cannot wait, first on the page.
     A time picked online to confirm, a hold about to lapse, or a new
     enquiry nobody has touched for two hours. Tap one to open its card. */
  function urgent() {
    var box = el('urgent'); box.textContent = '';
    var now = Date.now(), list = [];
    data.cards.forEach(function (c) {
      if (c.stage === 'cold') return;
      var touched = c.log && c.log.length;
      if (c.pencil && c.pencil.by === 'Website') list.push([0, c, 'Picked ' + day(c.pencil.date) + ' ' + c.pencil.time + ' online: confirm it']);
      else if (c.pencil && c.pencil.until && new Date(c.pencil.until).getTime() - now < 12 * 3600000) list.push([1, c, 'Hold ends in ' + Math.max(1, Math.round((new Date(c.pencil.until).getTime() - now) / 3600000)) + 'h: confirm or let go']);
      else if (!touched && now - new Date(c.since).getTime() > 2 * 3600000) list.push([2, c, 'Nobody in touch, ' + ago(c.since).replace(' ago', '') + ' waiting']);
    });
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(U.node('h2', null, 'Needs you now (' + list.length + ')'));
    list.sort(function (a, b) { return a[0] - b[0]; }).slice(0, 8).forEach(function (u) {
      var b = U.node('button', 'sched-urgent-row'); b.type = 'button';
      b.appendChild(U.node('b', null, (u[1].name || 'No name') + (u[1].postcode ? ', ' + u[1].postcode : '')));
      b.appendChild(U.node('span', null, u[2]));
      b.addEventListener('click', function () { global.DSSCHEDCARD.open(u[1], { act: act, book: openBook }); });
      box.appendChild(b);
    });
  }

  function render() {
    var b = el('board'); b.textContent = '';
    COLS.forEach(function (k) { b.appendChild(column(k[0], k[1], data.cards.filter(function (c) { return c.stage === k[0]; }))); });
    var booked = column('booked', 'Booked', []);
    booked.appendChild(U.node('p', 'panel-note', 'Drop a card here to book it. Booked surveys are on Today and the week.'));
    var link = U.node('a', 'btn btn--ghost btn--sm', 'Open Today'); link.href = '/staff/calendar.html';
    booked.appendChild(link);
    b.appendChild(booked);
    /* Gone quiet: kept, folded at the end, to try again later. */
    var cold = data.cards.filter(function (c) { return c.stage === 'cold'; });
    var fold = document.createElement('details'); fold.className = 'sched-coldfold';
    fold.appendChild(U.node('summary', null, 'Gone cold (' + cold.length + ')'));
    fold.appendChild(column('cold', 'Gone cold', cold));
    b.appendChild(fold);
  }

  /* Who's free: each day, each surveyor, their open starts. Grouped by
     person so "Tom can do 9, 10 or 2 on Saturday" reads in one line. */
  function renderFree() {
    var list = el('free-days'); list.textContent = '';
    var only = el('free-who').value;
    var days = {};
    (data.free || []).filter(function (s) { return !only || s.surveyor === only; }).forEach(function (s) {
      var d = days[s.date] = days[s.date] || {};
      (d[s.surveyor] = d[s.surveyor] || []).push(s);
    });
    var keys = Object.keys(days).sort();
    if (!keys.length) { list.appendChild(U.node('li', 'panel-note', 'Nobody has set free hours for the next two weeks. Each surveyor sets theirs on My hours.')); return; }
    keys.forEach(function (d) {
      var li = U.node('li', 'free-day');
      li.appendChild(U.node('span', 'free-date', day(d)));
      Object.keys(days[d]).sort().forEach(function (who) {
        var row = U.node('div', 'sched-row free-who');
        row.appendChild(U.node('span', 'free-name', cap(who)));
        days[d][who].forEach(function (s) { row.appendChild(button(s.time, 'sched-chip', function () { openBook(null, s); })); });
        li.appendChild(row);
      });
      list.appendChild(li);
    });
  }
  el('free-who').addEventListener('change', renderFree);
  el('free-go').addEventListener('click', function () { load(); });

  function openBook(c, slot) {
    /* From Who's free there is no card yet: pick who it is for. */
    el('b-for-row').hidden = Boolean(c);
    el('b-new').hidden = Boolean(c);
    if (!c) {
      var f = el('b-for'); f.textContent = '';
      data.cards.forEach(function (x, i) { var o = document.createElement('option'); o.value = String(i); o.textContent = (x.name || 'No name') + (x.postcode ? ', ' + x.postcode : ''); f.appendChild(o); });
      if (!data.cards.length) { el('note').textContent = 'Nobody is waiting on the board. Add the caller with the + button first.'; return; }
      c = data.cards[0];
      f.onchange = function () { booking = data.cards[Number(f.value)]; };
    }
    booking = c;
    el('book-title').textContent = 'Book ' + (c.name || 'survey') + (c.postcode ? ', ' + c.postcode : '');
    el('b-date').value = slot ? slot.date : '';
    el('b-time').value = slot ? slot.time : '';
    if (slot || c.surveyor) el('b-who').value = slot ? slot.surveyor : c.surveyor;
    if (c.surveyType) el('b-type').value = c.surveyType;
    el('b-type').disabled = c.kind === 'job';
    el('b-note').textContent = ''; el('b-hours').hidden = true;
    el('b-go').textContent = 'Book it';
    el('b-pencil').textContent = 'Pencil in (48h)';
    el('b-go').dataset.force = '';
    el('book').showModal();
  }

  async function submit(op) {
    var force = el('b-go').dataset.force === '1';
    var r = await U.send('/api/admin/scheduling', { op: op, kind: booking.kind, id: booking.id, date: el('b-date').value, time: el('b-time').value, surveyor: el('b-who').value, surveyType: el('b-type').value, force: force });
    el('b-go').dataset.force = '';
    if (r.ok) {
      el('book').close();
      var d = r.data || {};
      el('note').textContent = op === 'pencil'
        ? (d.byHand ? 'Pencilled in, held until someone lets it go (waiting on the agent).' : 'Pencilled in for 48 hours.') + ' It shows grey on Today.'
          + (d.sharing && d.sharing.length ? ' The same time is also offered to ' + d.sharing.join(', ') + '.' : '')
          + (d.recent && d.recent.length ? ' Heads up: ' + d.recent.join('; ') + '.' : '')
        : 'Booked. It is on Today now.' + (d.bumped && d.bumped.length ? ' ' + d.bumped.join(', ') + ' had that time pencilled and went back to Waiting, with a to-do to offer another time.' : '');
      load(); return;
    }
    if (r.data && r.data.clash) { global.DSSCHEDNEW.clash(r.data.clash); el('b-note').textContent = r.data.clash + ' Go ahead anyway?'; el('b-go').textContent = 'Book anyway'; el('b-pencil').textContent = 'Pencil anyway'; el('b-go').dataset.force = '1'; return; }
    el('b-note').textContent = (r.data && r.data.error) || 'That did not save.';
  }
  el('book-form').addEventListener('submit', function (e) { e.preventDefault(); submit('book'); });
  el('b-pencil').addEventListener('click', function () { submit('pencil'); });
  ['b-date', 'b-time', 'b-who'].forEach(function (id) { el(id).addEventListener('change', function () { el('b-go').dataset.force = ''; el('b-go').textContent = 'Book it'; el('b-pencil').textContent = 'Pencil in (48h)'; }); });
  el('b-cancel').addEventListener('click', function () { el('book').close(); });

  /* The dispatch day: which day and week are on screen, and what its buttons do. */
  var view = { day: '', week: '' };
  var dispatchOpts = {
    get today() { return data && data.today; },
    reload: function () { load(); },
    go: function (d, w) { view.day = d; view.week = w; load(); },
    book: function (c, slot) { openBook(c, slot); },
    focusCard: function (kind, id) { var n = document.getElementById(kind + '-' + id); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('is-hit'); } },
    /* A board card dropped on a free start books that card at that time. */
    dropOn: function (ref, slot) {
      var p = String(ref).split(':');
      var c = data.cards.find(function (x) { return x.kind === p[0] && x.id === Number(p[1]); });
      if (c) openBook(c, slot);
    }
  };
  var search = global.DSSCHEDSEARCH.wire(el('ss-q'), el('ss-list'), { cards: function () { return data && data.cards; }, open: function (c) { global.DSSCHEDCARD.open(c, { act: act, book: openBook }); } });
  async function load() {
    try {
      var pcode = el('free-pc').value.trim();
      var q = ['day=' + view.day, 'week=' + view.week].filter(function (x) { return !/=$/.test(x); });
      if (pcode) q.push('postcode=' + encodeURIComponent(pcode));
      data = await U.get('/api/admin/scheduling' + (q.length ? '?' + q.join('&') : ''));
      var t = el('b-type');
      if (!t.options.length) data.rates.forEach(function (r) { var o = document.createElement('option'); o.value = r.key; o.textContent = r.label + (r.pricePence ? ', £' + Math.round(r.pricePence / 100) : ''); t.appendChild(o); });
      render();
      urgent();
      renderFree();
      search.refresh();
      global.DSDISPATCH.render(el('dispatch'), data.dispatch, dispatchOpts);
      global.DSAFTER.render(el('after'), load);
      var hit = (focusAfter && document.getElementById(focusAfter)) || (location.hash && document.getElementById(location.hash.slice(1)));
      focusAfter = null;
      if (hit) { hit.scrollIntoView({ block: 'center' }); hit.classList.add('is-hit'); }
    } catch (e) { if (e.message !== 'unauthorised') el('note').textContent = 'Could not load the board.'; }
  }
  /* A caller just added: reload, then open their card with the times to offer. */
  global.addEventListener('sched:made', async function (e) {
    await load();
    var c = data.cards.find(function (x) { return x.kind === e.detail.kind && x.id === e.detail.id; });
    if (c) global.DSSCHEDCARD.open(c, { act: act, book: openBook });
  });
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
