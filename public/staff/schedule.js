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
  function todayIso() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }
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
    if (r.ok) { focusAfter = body.kind && body.id ? body.kind + '-' + body.id : null; await load(); }
    return r;
  }

  /* Every way the customer card opens: the same actions, and the card's fresh copy after a change. */
  var cardOpts = { act: act, book: openBook, reload: function () { load(); },
    find: function (kind, id) { return data && data.cards.find(function (x) { return x.kind === kind && x.id === id; }); } };
  var backTo = null;

  function button(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function card(c) {
    var box = U.node('article', 'sched-card');
    box.id = c.kind + '-' + c.id;
    box.draggable = true;
    box.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.kind + ':' + c.id); });
    /* A tap on the card itself (not its buttons or boxes) opens the full customer card. */
    box.addEventListener('click', function (e) { if (!e.target.closest('button,a,input,select,textarea,summary,details,label')) global.DSSCHEDCARD.open(c, cardOpts); });
    /* A row you can see is a button (the owner, 16 Nov 2026): the name with an arrow, the address,
       where contact stands, then small tags; the phone is a Call chip. */
    var top = U.node('div', 'sc-top');
    top.appendChild(U.node('h3', null, c.name || 'No name'));
    top.appendChild(U.node('span', 'c-chev', '›'));
    box.appendChild(top);
    box.appendChild(U.node('p', 'meta', [c.street, c.postcode].filter(Boolean).join(', ') || 'No address yet'));
    var last = c.log.length ? c.log[c.log.length - 1] : null;
    var brand = c.site === 'ati-london' ? 'ATi' : 'DampScan';
    box.appendChild(U.node('p', 'sched-status' + (last ? '' : ' is-cold'), brand + ' · ' + (last
      ? (HOW.find(function (h) { return h[0] === last.how; }) || ['', 'Note'])[1] + ' ' + ago(last.at) + ' by ' + last.by
      : 'nobody in touch yet, ' + ago(c.since).replace(' ago', '') + ' waiting')));
    var flags = [];
    var add = function (text, tone) { flags.push([text, tone || '']); };
    if (c.awaitingAgent) add('Waiting on ' + (c.agent || 'the agent'), 'is-info');
    else if (c.agent) add('Agent: ' + c.agent, 'is-info');
    if (c.deadline) add('Report by ' + c.deadline, 'is-warn');
    if (c.partial) add('Didn\'t finish the form', 'is-warn');
    if (c.next) add(c.next.on <= todayIso() ? (c.next.why || 'Follow up') + ' now' : 'Next contact ' + day(c.next.on), c.next.on <= todayIso() ? 'is-warn' : '');
    if (c.chose) add(c.chose.unsure ? 'Not sure which survey' : c.chose.name);
    if (c.wanted) add('Wants ' + c.wanted);
    if (c.pencil) add('Pencilled ' + day(c.pencil.date) + ' ' + c.pencil.time, 'is-info');
    if (c.pencil && c.pencil.by === 'Website') add('Picked a time online', 'is-warn');
    if ((c.same || []).length) add('Same person on another card', 'is-warn');
    if ((c.best || []).length && !c.pencil) add('Best ' + day(c.best[0].date) + ' ' + c.best[0].time + ' ' + cap(c.best[0].surveyor), 'is-good');
    var tags = U.node('div', 'sc-tags');
    if (c.phone) { var a = U.node('a', 'sc-call', 'Call'); a.href = 'tel:' + c.phone; a.setAttribute('aria-label', 'Call ' + (c.name || '') + ' ' + c.phone); tags.appendChild(a); }
    flags.forEach(function (f) { tags.appendChild(U.node('span', 'c-tag ' + f[1], f[0])); });
    if (tags.children.length) box.appendChild(tags);
    return box;
  }

  function column(key, title, cards) {
    var col = U.node('section', 'sched-col' + (cards.length ? '' : ' is-empty') + (key === 'booked' ? ' is-drop' : ''));
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
     A time picked online to confirm, a hold about to need a chase, or a new
     enquiry nobody has touched for two hours. Tap one to open its card. */
  function urgent() {
    var box = el('urgent'); box.textContent = '';
    var now = Date.now(), list = [];
    data.cards.forEach(function (c) {
      if (c.stage === 'cold') return;
      /* Their own email, a form or the system writing on the card is not us in touch. */
      var touched = (c.log || []).some(function (e) { return e.dir !== 'in' && ['Website', 'Inbox', 'Their page', 'Brain'].indexOf(e.by) === -1; });
      if (c.pencil && c.pencil.by === 'Website') list.push([0, c, 'Picked ' + day(c.pencil.date) + ' ' + c.pencil.time + ' online: confirm it']);
      else if (c.pencil && c.pencil.until && new Date(c.pencil.until).getTime() - now < 12 * 3600000) list.push([1, c, 'Chase in ' + Math.max(1, Math.round((new Date(c.pencil.until).getTime() - now) / 3600000)) + 'h: confirm or let go']);
      else if (!touched && now - new Date(c.since).getTime() > 2 * 3600000) list.push([2, c, 'Nobody in touch, ' + ago(c.since).replace(' ago', '') + ' waiting']);
      else if (c.next && c.next.on <= todayIso()) list.push([c.next.why === 'Follow up' ? 4 : 3, c, (c.next.why || 'Follow up') + (c.next.on < todayIso() ? ', due ' + day(c.next.on) : ', due today')]);
    });
    /* Booked customers who asked something on their page: first, and they open the job card. */
    (data.asks || []).forEach(function (a) {
      list.push([-1, { name: a.name, postcode: a.postcode, jobId: a.id }, a.ask.what === 'move' ? 'Asked to move to ' + day(a.ask.date) + ' ' + a.ask.time : 'Messaged: "' + a.ask.text + '"']);
    });
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(U.node('h2', null, 'Needs you now (' + list.length + ')'));
    var shown = list.sort(function (a, b) { return a[0] - b[0]; }).slice(0, 8);
    shown.forEach(function (u) {
      var b = U.node('button', 'sched-urgent-row'); b.type = 'button';
      b.appendChild(U.node('b', null, (u[1].name || 'No name') + (u[1].postcode ? ', ' + u[1].postcode : '')));
      b.appendChild(U.node('span', null, u[2]));
      b.addEventListener('click', function () { if (u[1].jobId) global.DSPOP.open(u[1].jobId, { onChange: load }); else global.DSSCHEDCARD.open(u[1], cardOpts); });
      box.appendChild(b);
    });
    if (list.length > shown.length) box.appendChild(U.node('p', 'panel-note', 'and ' + (list.length - shown.length) + ' more on the board'));
  }

  function render() {
    var b = el('board'); b.textContent = '';
    COLS.forEach(function (k) { b.appendChild(column(k[0], k[1], data.cards.filter(function (c) { return c.stage === k[0]; }))); });
    var booked = column('booked', 'Booked', []);
    booked.appendChild(U.node('p', 'panel-note', 'Drop a card here to book it.'));
    var link = U.node('a', 'btn btn--ghost btn--sm', 'Open Today'); link.href = '/staff/calendar.html';
    booked.appendChild(link);
    b.appendChild(booked);
    /* Gone quiet: kept, folded at the end, to try again later. */
    var cold = data.cards.filter(function (c) { return c.stage === 'cold'; });
    var fold = document.createElement('details'); fold.className = 'sched-coldfold';
    if (!cold.length) fold.classList.add('is-empty');
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

  function openBook(c, slot, fromCard) {
    /* Cancel goes back to the customer card it came from, not the board. */
    backTo = fromCard ? c : null;
    /* From Who's free there is no card yet: pick who it is for. */
    el('b-for-row').hidden = Boolean(c);
    if (!c) {
      var f = el('b-for'); f.textContent = '';
      data.cards.forEach(function (x, i) { var o = document.createElement('option'); o.value = String(i); o.textContent = (x.name || 'No name') + (x.postcode ? ', ' + x.postcode : ''); f.appendChild(o); });
      if (!data.cards.length) { el('note').textContent = 'Nobody is waiting on the board. Add the caller with the + button first.'; return; }
      c = data.cards[0];
      f.onchange = function () { booking = data.cards[Number(f.value)]; };
    }
    booking = c;
    /* A pencilled time (picked online or offered) fills the form, so booking it is one tap. */
    if (!slot && c.pencil) slot = { date: c.pencil.date, time: String(c.pencil.time).slice(0, 5), surveyor: c.pencil.surveyor };
    el('book-title').textContent = 'Book ' + (c.name || 'survey') + (c.postcode ? ', ' + c.postcode : '');
    el('b-date').value = slot ? slot.date : '';
    el('b-time').value = slot ? slot.time : '';
    /* Always this customer's own choices, never the last card's. */
    el('b-who').value = slot ? slot.surveyor : (c.surveyor || '');
    el('b-type').value = c.surveyType || '';
    el('b-type').disabled = c.kind === 'job';
    /* An enquiry's survey sets its price: Book it waits for one (Pencil in does not need it). */
    el('b-type').required = c.kind !== 'job';
    global.DSSCHEDX.fill(c, data);
    el('b-note').textContent = ''; el('b-hours').hidden = true;
    el('b-go').textContent = 'Book it';
    el('b-pencil').textContent = 'Pencil in (48h)';
    el('b-go').dataset.force = '';
    el('book').showModal();
  }

  async function submit(op) {
    var force = el('b-go').dataset.force === '1';
    var r = await U.send('/api/admin/scheduling', Object.assign({ op: op, kind: booking.kind, id: booking.id, date: el('b-date').value, time: el('b-time').value, surveyor: el('b-who').value, surveyType: el('b-type').value, force: force }, op === 'book' ? global.DSSCHEDX.values() : {}));
    el('b-go').dataset.force = '';
    if (r.ok) {
      el('book').close();
      var d = r.data || {};
      el('note').textContent = op === 'pencil'
        ? (d.byHand ? 'Pencilled in, held until someone lets it go (waiting on the agent).' : 'Pencilled in for 48 hours.') + ' It shows grey on Today.'
          + (d.sharing && d.sharing.length ? ' The same time is also offered to ' + d.sharing.join(', ') + '.' : '')
          + (d.recent && d.recent.length ? ' Heads up: ' + d.recent.join('; ') + '.' : '')
        : 'Booked. It is on Today now.' + (d.bumped && d.bumped.length ? ' ' + d.bumped.join(', ') + ' had that time pencilled and went back to Waiting, with a to-do to offer another time.' : '');
      backTo = null;
      await load();
      /* Booked: their customer card next, for the deposit and their page link. */
      if (op === 'book' && d.jobId && global.DSPOP) global.DSPOP.open(d.jobId, { onChange: load });
      return;
    }
    if (r.data && r.data.clash) { global.DSSCHEDNEW.clash(r.data.clash); el('b-note').textContent = r.data.clash + ' Go ahead anyway?'; el('b-go').textContent = 'Book anyway'; el('b-pencil').textContent = 'Pencil anyway'; el('b-go').dataset.force = '1'; return; }
    el('b-note').textContent = (r.data && (r.data.error || Object.values(r.data.errors || {})[0])) || 'That did not save.';
  }
  el('book-form').addEventListener('submit', function (e) { e.preventDefault(); submit('book'); });
  el('b-pencil').addEventListener('click', function () { submit('pencil'); });
  ['b-date', 'b-time', 'b-who'].forEach(function (id) { el(id).addEventListener('change', function () { el('b-go').dataset.force = ''; el('b-go').textContent = 'Book it'; el('b-pencil').textContent = 'Pencil in (48h)'; }); });
  el('b-cancel').addEventListener('click', function () {
    el('book').close();
    var c = backTo && cardOpts.find(backTo.kind, backTo.id); backTo = null;
    if (c) global.DSSCHEDCARD.open(c, cardOpts);
  });

  /* The dispatch day: which day and week are on screen, and what its buttons do. */
  /* ?day=YYYY-MM-DD (the Monday briefing's days) opens that day's plan. */
  var asked = (new URLSearchParams(global.location.search).get('day') || '').match(/^\d{4}-\d{2}-\d{2}$/);
  var view = { day: asked ? asked[0] : '', week: '' };
  var dispatchOpts = {
    get today() { return data && data.today; },
    reload: function () { load(); },
    go: function (d, w) { view.day = d; view.week = w; load(); },
    book: function (c, slot) { openBook(c, slot); },
    /* The customers waiting whose best times include this start (lib/best-fit.js, already on each card). */
    fits: function (slot) {
      return ((data && data.cards) || []).filter(function (c) {
        /* Free starts are on the hour; a snug best time (10:30 after a survey) shows on its hour's start. */
        return (c.best || []).some(function (b) { return b.date === slot.date && b.surveyor === slot.surveyor && String(b.time).slice(0, 2) === String(slot.time).slice(0, 2); });
      });
    },
    focusCard: function (kind, id) { if (global.DSSCHVIEW) global.DSSCHVIEW.show('book'); var n = document.getElementById(kind + '-' + id); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('is-hit'); } },
    /* A board card dropped on a free start books that card at that time. */
    dropOn: function (ref, slot) {
      var p = String(ref).split(':');
      var c = data.cards.find(function (x) { return x.kind === p[0] && x.id === Number(p[1]); });
      if (c) openBook(c, slot);
    }
  };
  var search = global.DSSCHEDSEARCH.wire(el('ss-q'), el('ss-list'), { cards: function () { return data && data.cards; }, open: function (c) { global.DSSCHEDCARD.open(c, cardOpts); } });
  var opened = false;
  async function load() {
    try {
      var pcode = el('free-pc').value.trim();
      var q = ['day=' + view.day, 'week=' + view.week].filter(function (x) { return !/=$/.test(x); });
      if (pcode) q.push('postcode=' + encodeURIComponent(pcode));
      data = await U.get('/api/admin/scheduling' + (q.length ? '?' + q.join('&') : ''));
      var t = el('b-type');
      /* Damp surveys, then damp and timber, each by size: two short lists rather than one long one. */
      if (t.options.length < 2) [['Damp survey', function (r) { return !/^dt-/.test(r.key); }], ['Damp and timber', function (r) { return /^dt-/.test(r.key); }]].forEach(function (g) {
        var grp = document.createElement('optgroup'); grp.label = g[0];
        data.rates.filter(g[1]).forEach(function (r) { var o = document.createElement('option'); o.value = r.key; o.textContent = r.label.replace(/^Damp and timber, (.)/, function (m, a) { return a.toUpperCase(); }) + (r.pricePence ? ', £' + Math.round(r.pricePence / 100) : ''); grp.appendChild(o); });
        if (grp.children.length) t.appendChild(grp);
      });
      render();
      urgent();
      renderFree();
      search.refresh();
      global.DSDISPATCH.render(el('dispatch'), data.dispatch, dispatchOpts);
      global.DSAFTER.render(el('after'), load);
      var hit = (focusAfter && document.getElementById(focusAfter)) || (location.hash && document.getElementById(location.hash.slice(1)));
      focusAfter = null;
      if (hit) { hit.scrollIntoView({ block: 'center' }); hit.classList.add('is-hit'); }
      /* From Search: the customer's card opens straight away, once. */
      var want = !opened && location.hash && data.cards.find(function (x) { return '#' + x.kind + '-' + x.id === location.hash; });
      if (want) { opened = true; global.DSSCHEDCARD.open(want, cardOpts); }
    } catch (e) { if (e.message !== 'unauthorised') el('note').textContent = 'Could not load the board.'; }
  }
  /* A caller just added: reload, then open their card with the times to offer. */
  global.addEventListener('sched:made', async function (e) {
    await load();
    var c = data.cards.find(function (x) { return x.kind === e.detail.kind && x.id === e.detail.id; });
    if (c) global.DSSCHEDCARD.open(c, cardOpts);
    /* Someone already booked is on their customer card, not the board. */
    else if (e.detail.kind === 'job' && global.DSPOP) global.DSPOP.open(e.detail.id, { onChange: load });
  });
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
