/* What a customer can ask from their page (lib/portal-asks.js): On my way
   shown at the top on the day, Ask to move (the surveyors' real free times,
   a request until the team confirms), add photos before the visit, and
   Message us. Nothing here changes the booking. Uses the page's own parts
   (portal-parts.js) so it names neither brand. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, btn = P.btn, I = P.I;
  var shortDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var ask = function (token, body) {
    return fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ doc: 'portal', t: token }, body)) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  };

  /* On the day, first thing under the greeting (the owners' chosen design from the
     page preview, UAT 15 Nov 2026): who is coming, when and where, then the van
     driving along a road to "On the way". */
  var VAN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>';
  /* "between 9 and 10am": the one-hour arrival window. */
  function between(tm) {
    var a = Number(tm.slice(0, 2)), b = (a + 1) % 24, ap = function (x) { return x < 12 ? 'am' : 'pm'; }, n = function (x) { return (x % 12 || 12) + (tm.slice(3) === '00' ? '' : ':' + tm.slice(3)); };
    return 'between ' + (ap(a) === ap(b) ? n(a) + ' and ' + n(b) + ap(b) : n(a) + ap(a) + ' and ' + n(b) + ap(b));
  }
  var ctx = {};
  function top(p, main, token, reload) {
    ctx = { p: p, token: token, reload: reload, chips: false };
    if (!p.onWay) return;
    var card = h('div', 'pt-card pt-onway');
    card.appendChild(t('h2', null, (p.onWay.surveyor || 'Your surveyor') + ' is on the way'));
    var street = p.address ? String(p.address).split(',')[0].trim() : '';
    var when = p.visit && p.visit.time ? 'Arriving ' + between(p.visit.time) : 'Heading to you now';
    card.appendChild(t('p', null, when + (street ? ' at ' + street : '') + '.'));
    var road = h('div', 'pt-road', '<i>' + VAN + '</i><span>On the way</span>'); road.setAttribute('role', 'img'); road.setAttribute('aria-label', 'Your surveyor driving to you');
    card.appendChild(road);
    main.appendChild(card);
  }

  /* A sheet rising from the bottom over a dimmed page (the owners' chosen design
     from the page preview, UAT 15 Nov 2026): the page stays where it was, and
     the sheet closes by its cross, a tap on the dimmed page or Escape. */
  function sheet(title, fill) {
    var scrim = h('div', 'pt-scrim'), sh = h('div', 'pt-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    var head = h('div', 'pt-sheet-head'); head.appendChild(t('h2', null, title));
    var x = btn('pt-sheet-x', '<span aria-hidden="true">&times;</span>', function () { close(); }); x.setAttribute('aria-label', 'Close'); head.appendChild(x);
    sh.appendChild(h('div', 'pt-grab')); sh.appendChild(head);
    var was = document.activeElement;
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      sh.classList.remove('open'); scrim.classList.remove('open'); document.removeEventListener('keydown', key); document.body.classList.remove('pt-sheet-on');
      setTimeout(function () { sh.remove(); scrim.remove(); if (was && was.focus) was.focus(); }, 260);
    }
    scrim.addEventListener('click', close); document.addEventListener('keydown', key);
    fill(sh, close);
    document.body.appendChild(scrim); document.body.appendChild(sh); document.body.classList.add('pt-sheet-on');
    void sh.offsetWidth; scrim.classList.add('open'); sh.classList.add('open'); x.focus();
  }

  /* The surveyors' real free times: days as tiles to swipe, then the times three across. */
  function movePicker(p, box, token, reload, close) {
    var area = h('div', 'pt-movearea'); box.appendChild(area);
    var self = Boolean(p.move.self), pick = { date: null, time: null };
    area.appendChild(h('div', 'pt-ring pt-ring--sm'));
    ask(token, { op: 'times' }).then(function (d) {
      area.textContent = '';
      if (!d.ok || !d.days || !d.days.length) { area.appendChild(t('p', null, 'No other times free just now. Call us on ' + p.brand.phoneLabel + ' and we\'ll help.')); return; }
      var days = h('div', 'pt-days'), times = h('div', 'pt-times');
      var send = btn('pt-btn', '<span class="in">' + (self ? 'Move to this time' : 'Ask for this time') + '</span>', function () {
        if (!pick.date || !pick.time) return;
        send.classList.add('busy'); send.disabled = true;
        ask(token, { op: 'move', date: pick.date, time: pick.time }).then(function (r) {
          send.classList.remove('busy'); send.disabled = false;
          if (r.ok) { if (close) close(); P.toast(r.moved ? 'Done: moved to ' + shortDay(r.moved.date) + ' at ' + r.moved.time + '. We\'ll text you the new time.' : 'Asked. We\'ll call to confirm.'); reload(); }
          else P.toast(r.error === 'taken' ? 'That time has just gone. Pick another.' : 'That didn\'t send. Please try again.');
        });
      });
      send.disabled = true;
      var choose = function (wrap, b) { Array.prototype.forEach.call(wrap.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
      d.days.forEach(function (day) {
        var dt = new Date(day.date + 'T12:00:00Z'), o = function (f) { return dt.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, f)); };
        var b = btn(null, '<small>' + o({ weekday: 'short' }) + '</small><b>' + o({ day: 'numeric' }) + '</b><small>' + o({ month: 'short' }) + '</small>', function () {
          choose(days, b); pick.date = day.date; pick.time = null; send.disabled = true; times.textContent = '';
          day.times.forEach(function (tm) {
            var tb = btn(null, tm, function () { choose(times, tb); pick.time = tm; send.disabled = false; });
            tb.setAttribute('aria-pressed', 'false'); times.appendChild(tb);
          });
        });
        b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', o({ weekday: 'long', day: 'numeric', month: 'long' }));
        days.appendChild(b);
      });
      area.appendChild(t('div', 'pt-label', 'Pick a day')); area.appendChild(days);
      area.appendChild(t('div', 'pt-label', 'Then a time')); area.appendChild(times);
      area.appendChild(send);
      area.appendChild(t('p', 'pt-hint', self ? 'Your survey moves straight away, with the same surveyor.' : 'This asks us to move it. Your survey stays as it is until we call to confirm.'));
    }, function () { area.textContent = ''; area.appendChild(t('p', null, 'No connection. Please try again.')); });
  }

  function messageForm(p, box, token, reload, close) {
    var f = h('label', 'pt-field'), ta = t('textarea'); ta.rows = 4; ta.maxLength = 1000; ta.setAttribute('aria-label', 'Your message'); ta.placeholder = (p.messages || []).length ? 'Anything else?' : 'Your message';
    f.appendChild(ta); box.appendChild(f);
    var go = btn('pt-btn', '<span class="in">Send message</span>', function () {
      if (ta.value.trim().length < 2) { ta.focus(); return; }
      go.classList.add('busy'); go.disabled = true;
      ask(token, { op: 'message', text: ta.value }).then(function (r) {
        go.classList.remove('busy'); go.disabled = false;
        if (r.ok) { ta.value = ''; if (close) close(); P.toast('Sent. We\'ll reply by text, and it shows here too.'); openNext = 'message'; reload(); }
        else P.toast(r.error === 'too_many' ? 'Please call us on ' + p.brand.phoneLabel + '.' : 'That didn\'t send. Please try again.');
      });
    });
    box.appendChild(go);
    box.appendChild(t('p', 'pt-hint', 'Goes straight to the team. We reply by text, and it shows here too. Urgent? Call ' + p.brand.phoneLabel + '.'));
    return ta;
  }

  /* Ask to move it and Message us beside Add to calendar on the visit card. */
  function chips(row) {
    var p = ctx.p; if (!p || !ctx.token) return;
    ctx.chips = true;
    if (p.move && p.move.can && !p.move.asked) row.appendChild(btn('pt-chip', ICON.move + '<span>Ask to move it</span>', function () { sheet('Pick a new time', function (sh, close) { movePicker(p, sh, ctx.token, ctx.reload, close); }); }));
    row.appendChild(btn('pt-chip', ICON.msg + '<span>Message us</span>', function () { sheet('Message us', function (sh, close) { var ta = messageForm(p, sh, ctx.token, ctx.reload, close); setTimeout(function () { ta.focus(); }, 280); }); }));
  }
  var ICON = {
    move: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
    msg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg>'
  };

  /* A move asked for shows as a card; with no visit card to hold the chips, the picker sits in a fold. */
  function moveFold(p, main, token, reload) {
    if (!p.move) return;
    if (p.move.asked) {
      var c = h('div', 'pt-card soft'); c.appendChild(P.banner('', 'You asked to move to', shortDay(p.move.asked.date) + ' at ' + p.move.asked.time + '.'));
      c.appendChild(t('p', null, 'We\'ll call to confirm. Until then your survey stays as it is.')); main.appendChild(c); return;
    }
    if (!p.move.can || ctx.chips) return;
    P.fold(main, 'Need a different time?', function (box) {
      var go = btn('pt-btn ghost', '<span class="in">See other times</span>', function () { go.remove(); movePicker(p, box, token, reload, null); });
      box.appendChild(go);
    });
  }

  /* Straight to storage (the booking form's own route), then added to their survey. */
  function upload(file) {
    return fetch('/api/upload?mode=presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type }) })
      .then(function (r) { return r.json(); }).then(function (s) {
        if (s.ok && s.url) return fetch(s.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }).then(function (r) { if (!r.ok) throw new Error(); return s.path; });
        return fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
          .then(function (r) { return r.json(); }).then(function (x) { if (!x.ok || !x.path) throw new Error(); return x.path; });
      });
  }
  /* After sending, the page is drawn again with that fold open on what they sent. */
  var openNext = null;
  var ticked = function (tag, cls, text) { var e = h(tag, cls, I.check); e.appendChild(document.createTextNode(text)); return e; };
  var stamp = function (at) { var d = new Date(at); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }); };

  function photosFold(p, main, token, reload, api) {
    if (['requested', 'waiting', 'agent', 'deposit', 'booked'].indexOf(p.state) === -1) return;
    var n = p.photos || 0, show = openNext === 'photos';
    if (show) openNext = null;
    P.fold(main, n ? 'Your photos (' + n + ')' : 'Add photos', function (box) {
      if (n) {
        var grid = h('div', 'pt-photos');
        for (var i = 0; i < Math.min(n, 30); i += 1) { var a = t('a'), im = t('img'); a.href = api + '&file=photo&i=' + i; a.dataset.view = '1'; a.dataset.name = 'Your photo ' + (i + 1); im.src = a.href; im.alt = 'Your photo ' + (i + 1); im.loading = 'lazy'; a.appendChild(im); grid.appendChild(a); }
        box.appendChild(grid);
        box.appendChild(ticked('p', 'pt-sent', 'We have ' + (n === 1 ? 'your photo' : 'all ' + n) + '.'));
      }
      var lab = h('label', 'pt-btn ghost', '<span class="in">' + (n ? 'Add more photos' : 'Choose photos') + '</span>'), inp = t('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.hidden = true; lab.appendChild(inp);
      var msg = t('p', 'pt-hint', n ? '' : 'Photos of the damp help us prepare.');
      inp.addEventListener('change', function () {
        var files = Array.prototype.slice.call(inp.files || [], 0, 10);
        if (!files.length) return;
        lab.classList.add('busy'); msg.hidden = false; msg.textContent = 'Sending ' + files.length + '…';
        var paths = [];
        files.reduce(function (ch, f) { return ch.then(function () { return upload(f).then(function (x) { paths.push(x); }, function () {}); }); }, Promise.resolve())
          .then(function () { return paths.length ? ask(token, { op: 'photos', paths: paths }) : { ok: false }; })
          .then(function (r) {
            lab.classList.remove('busy'); inp.value = '';
            if (r.ok) { P.toast(r.added + ' photo' + (r.added === 1 ? '' : 's') + ' added. Thank you.'); openNext = 'photos'; reload(); }
            else msg.textContent = r.error === 'too_many' ? 'That\'s as many as we can take here. Send any more by WhatsApp.' : 'Those didn\'t come through. Please try again, or send them by WhatsApp.';
          });
      });
      msg.hidden = !msg.textContent; box.appendChild(lab); box.appendChild(msg);
    }, show);
  }

  function messageFold(p, main, token, reload) {
    var sent = p.messages || [], show = openNext === 'message';
    if (show) openNext = null;
    /* With the chip on the visit card, the fold only keeps what they sent. */
    if (ctx.chips && !sent.length) return;
    /* Our replies came by text too; the newest one opens the fold so it is seen. */
    var last = sent[sent.length - 1];
    P.fold(main, ctx.chips ? 'Messages (' + sent.length + ')' : 'Message us', function (box) {
      /* Theirs and ours in order, so they know it arrived and what we said. */
      sent.forEach(function (m) {
        var ours = m.from === 'us';
        var b = h('div', ours ? 'pt-said pt-said--us' : 'pt-said'); b.appendChild(t('div', 'pt-quote', m.text));
        b.appendChild(ours ? t('small', 'pt-sent', (m.who || p.brand.name) + ', ' + stamp(m.at)) : ticked('small', 'pt-sent', 'Sent ' + stamp(m.at)));
        box.appendChild(b);
      });
      if (!ctx.chips) messageForm(p, box, token, reload, null);
      else box.appendChild(btn('pt-chip', ICON.msg + '<span>Write back</span>', function () { sheet('Message us', function (sh, close) { var ta = messageForm(p, sh, ctx.token, ctx.reload, close); setTimeout(function () { ta.focus(); }, 280); }); }));
    }, show || Boolean(last && last.from === 'us'));
  }

  function more(p, main, token, reload, api) {
    moveFold(p, main, token, reload);
    photosFold(p, main, token, reload, api);
    messageFold(p, main, token, reload);
  }

  global.PTASK = { top: top, more: more, chips: chips };
})(window);
